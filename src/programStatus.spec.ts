import { expect } from "chai";
import * as clc from "colorette";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as sinon from "sinon";
import {
  clearRecord,
  detectProgramStatusSupport,
  encodeBase64Text,
  formatReportSequence,
  hasTerminfoPstCapability,
  isProgramStatusSupported,
  isUserCancellationError,
  markUserInterrupted,
  resetProgramStatusState,
  sanitizeFreeText,
  sanitizeId,
  setChildRecordStatus,
  setDoneStatus,
  setErrorStatus,
  setIdleStatus,
  setProgramStatusSupported,
  setWorkingStatus,
  withBlockedStatus,
  withWorkingStatus,
} from "./programStatus";

class MockReadStream extends EventEmitter {
  isTTY = true;
  isRaw = false;
  paused = true;
  unshifted: Buffer[] = [];

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }

  isPaused(): boolean {
    return this.paused;
  }

  resume(): this {
    this.paused = false;
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  unshift(chunk: Buffer): void {
    this.unshifted.push(chunk);
  }
}

class MockWriteStream extends EventEmitter {
  isTTY = true;
  written: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }
}

describe("programStatus", () => {
  let sandbox: sinon.SinonSandbox;
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "IS_FIREBASE_CLI",
    "FIREBASE_PROGRAM_STATUS",
    "FIREBASE_CLI_NO_PROGRAM_STATUS",
    "CI",
    "GITHUB_ACTIONS",
    "GITHUB_ACTION_REPOSITORY",
    "AI_AGENT",
    "ANTIGRAVITY_AGENT",
    "CLAUDECODE",
    "TERM",
    "IS_FIREBASE_MCP",
  ];

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    resetProgramStatusState();
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.IS_FIREBASE_CLI = "true";
    process.env.TERM = "xterm-256color";
  });

  afterEach(() => {
    sandbox.restore();
    resetProgramStatusState();
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = savedEnv[k];
      }
    }
  });

  describe("sanitizeFreeText & encodeBase64Text", () => {
    it("strips ANSI escape codes and control characters", () => {
      const styled = `${clc.bold(clc.green("✔"))} Deploying to ${clc.cyan("my-project")}\nLine 2\tTabbed\x07\x1b]0;title\x07`;
      const cleaned = sanitizeFreeText(styled, 2048);
      expect(cleaned).to.equal("✔ Deploying to my-project Line 2 Tabbed");
    });

    it("truncates UTF-8 safely without splitting multi-byte characters", () => {
      // "🔥" is 4 bytes in UTF-8. 3 emojis = 12 bytes.
      const text = "🔥🔥🔥";
      expect(Buffer.byteLength(sanitizeFreeText(text, 10), "utf8")).to.equal(8);
      expect(sanitizeFreeText(text, 10)).to.equal("🔥🔥");
    });

    it("encodes sanitized text to standard base64", () => {
      const encoded = encodeBase64Text("Installing updates", 2048);
      expect(encoded).to.equal("SW5zdGFsbGluZyB1cGRhdGVz");
      expect(Buffer.from(encoded, "base64").toString("utf8")).to.equal("Installing updates");
    });
  });

  describe("sanitizeId", () => {
    it("preserves valid hierarchical ids and sanitizes disallowed characters", () => {
      expect(sanitizeId("deploy/hosting/my-site_1.0")).to.equal("deploy/hosting/my-site_1.0");
      expect(sanitizeId("deploy/functions/us-central1:myFunc@v1")).to.equal(
        "deploy/functions/us-central1-myFunc-v1",
      );
    });

    it("enforces segment length (32), depth (8), and total length (128) limits", () => {
      const longSeg = "a".repeat(50);
      expect(sanitizeId(longSeg)).to.equal("a".repeat(32));

      const deepPath = "a/b/c/d/e/f/g/h/i/j";
      expect(sanitizeId(deepPath)).to.equal("a/b/c/d/e/f/g/h");
    });

    it("returns undefined for empty or unsanitizable ids", () => {
      expect(sanitizeId("")).to.be.undefined;
      expect(sanitizeId("///")).to.be.undefined;
      expect(sanitizeId(":::")).to.be.undefined;
    });
  });

  describe("formatReportSequence", () => {
    it("formats root working, blocked, done, error, idle, and clear sequences", () => {
      expect(
        formatReportSequence({
          state: "working",
          msg: "Installing updates",
        }),
      ).to.equal("\x1b]7501;state=working:app=firebase:msg=SW5zdGFsbGluZyB1cGRhdGVz\x1b\\");

      expect(
        formatReportSequence({
          state: "blocked",
          kind: "permission",
          msg: "Apply 3 to add, 1 to change, 0 to destroy?",
        }),
      ).to.equal(
        "\x1b]7501;state=blocked:kind=permission:app=firebase:msg=QXBwbHkgMyB0byBhZGQsIDEgdG8gY2hhbmdlLCAwIHRvIGRlc3Ryb3k/\x1b\\",
      );

      expect(
        formatReportSequence({
          state: "clear",
          id: "deploy/hosting",
        }),
      ).to.equal("\x1b]7501;state=clear:id=deploy/hosting\x1b\\");
    });

    it("clamps progress to 0..100 on working/blocked and omits it on other states", () => {
      expect(
        formatReportSequence({
          state: "working",
          id: "us-east",
          title: "US East",
          progress: 40.4,
          msg: "Pushing image",
        }),
      ).to.equal(
        "\x1b]7501;state=working:id=us-east:progress=40:title=VVMgRWFzdA==:msg=UHVzaGluZyBpbWFnZQ==\x1b\\",
      );

      expect(
        formatReportSequence({
          state: "done",
          progress: 50,
          msg: "Done",
        }),
      ).to.equal("\x1b]7501;state=done:app=firebase:msg=RG9uZQ==\x1b\\");
    });
  });

  describe("hasTerminfoPstCapability", () => {
    it("detects Pst capability in compiled terminfo files", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-terminfo-"));
      try {
        const termDir = path.join(tmpDir, "r");
        fs.mkdirSync(termDir, { recursive: true });
        fs.writeFileSync(
          path.join(termDir, "rex-term"),
          Buffer.from("header\0Pst\0\\E]7501;%p1%s\\E\\\\\0", "utf8"),
        );

        expect(hasTerminfoPstCapability("rex-term", [tmpDir])).to.be.true;
        expect(hasTerminfoPstCapability("other-term", [tmpDir])).to.be.false;
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("detectProgramStatusSupport", () => {
    it("returns true when terminal replies with OSC 7501 ; ? before DA1 and preserves typeahead", async () => {
      const stdin = new MockReadStream();
      const stderr = new MockWriteStream();

      const promise = detectProgramStatusSupport({
        stdin: stdin as unknown as NodeJS.ReadStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        terminfoDirs: [],
      });

      expect(stderr.written).to.deep.equal(["\x1b]7501;?\x1b\\\x1b[c"]);
      stdin.emit("data", Buffer.from("y\x1b]7501;?\x1b\\\x1b[?62;22c", "utf8"));

      const supported = await promise;
      expect(supported).to.be.true;
      expect(isProgramStatusSupported()).to.be.true;
      expect(stdin.isRaw).to.be.false;
      expect(stdin.isPaused()).to.be.true;
      expect(stdin.unshifted.map((b) => b.toString("utf8"))).to.deep.equal(["y"]);
    });

    it("returns false when terminal replies only to DA1 (CSI c)", async () => {
      const stdin = new MockReadStream();
      const stderr = new MockWriteStream();

      const promise = detectProgramStatusSupport({
        stdin: stdin as unknown as NodeJS.ReadStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        terminfoDirs: [],
      });

      stdin.emit("data", Buffer.from("\x1b[?62;c", "utf8"));

      const supported = await promise;
      expect(supported).to.be.false;
      expect(isProgramStatusSupported()).to.be.false;
      expect(stdin.unshifted).to.be.empty;
    });

    it("returns false when detection times out", async () => {
      const stdin = new MockReadStream();
      const stderr = new MockWriteStream();

      const supported = await detectProgramStatusSupport({
        stdin: stdin as unknown as NodeJS.ReadStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        timeoutMs: 10,
        terminfoDirs: [],
      });

      expect(supported).to.be.false;
    });

    it("returns false immediately in CI, AI agent, or non-CLI environments", async () => {
      const stdin = new MockReadStream();
      const stderr = new MockWriteStream();

      process.env.CI = "true";
      const supported = await detectProgramStatusSupport({
        stdin: stdin as unknown as NodeJS.ReadStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
      });
      expect(supported).to.be.false;
      expect(stderr.written).to.be.empty;
    });
  });

  describe("state transitions and stack management", () => {
    let stderrWriteStub: sinon.SinonStub;
    let written: string[];

    beforeEach(() => {
      written = [];
      stderrWriteStub = sandbox.stub(process.stderr, "write").callsFake((chunk: unknown) => {
        written.push(
          typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"),
        );
        return true;
      });
      setProgramStatusSupported(true);
    });

    it("restores previous working status after withWorkingStatus and withBlockedStatus", async () => {
      setWorkingStatus({ msg: "Running firebase deploy" });
      await withWorkingStatus("Preparing functions", async () => {
        await withBlockedStatus("permission", "Delete oldFunc?", async () => {
          return true;
        });
      });
      setDoneStatus("Deploy complete!");

      expect(stderrWriteStub.called).to.be.true;
      expect(written).to.deep.equal([
        formatReportSequence({ state: "working", msg: "Running firebase deploy" }),
        formatReportSequence({ state: "working", msg: "Preparing functions" }),
        formatReportSequence({ state: "blocked", kind: "permission", msg: "Delete oldFunc?" }),
        formatReportSequence({ state: "working", msg: "Preparing functions" }),
        formatReportSequence({ state: "working", msg: "Running firebase deploy" }),
        formatReportSequence({ state: "done", msg: "Deploy complete!" }),
      ]);
    });

    it("clears child records before reporting done or error", () => {
      setWorkingStatus({ msg: "Deploying" });
      setChildRecordStatus({
        id: "deploy/hosting",
        state: "working",
        title: "hosting",
        progress: 50,
        msg: "Uploading files",
      });
      clearRecord("deploy");
      setErrorStatus("Hosting upload failed");

      expect(written).to.deep.equal([
        formatReportSequence({ state: "working", msg: "Deploying" }),
        formatReportSequence({
          id: "deploy/hosting",
          state: "working",
          title: "hosting",
          progress: 50,
          msg: "Uploading files",
        }),
        formatReportSequence({ state: "clear", id: "deploy" }),
        formatReportSequence({ state: "clear" }),
        formatReportSequence({ state: "error", msg: "Hosting upload failed" }),
      ]);
    });

    it("reports state=idle when interrupted by the user instead of done or error", () => {
      setWorkingStatus({ msg: "Starting emulators" });
      setIdleStatus("All emulators ready");
      markUserInterrupted("Emulators stopped");
      setDoneStatus("Completed firebase emulators:start");

      expect(written).to.deep.equal([
        formatReportSequence({ state: "working", msg: "Starting emulators" }),
        formatReportSequence({ state: "idle", msg: "All emulators ready" }),
        formatReportSequence({ state: "idle", msg: "Emulators stopped" }),
        formatReportSequence({ state: "idle" }),
      ]);
    });
  });

  describe("isUserCancellationError", () => {
    it("identifies ExitPromptError and user cancellation messages", () => {
      const exitPromptErr = new Error("User force closed the prompt with 0 null");
      exitPromptErr.name = "ExitPromptError";
      expect(isUserCancellationError(exitPromptErr)).to.be.true;
      expect(isUserCancellationError(new Error("Command aborted."))).to.be.true;
      expect(isUserCancellationError(new Error("Deployment canceled."))).to.be.true;
      expect(isUserCancellationError(new Error("Something else broke"))).to.be.false;
    });
  });
});
