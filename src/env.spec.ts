import { expect } from "chai";
import * as sinon from "sinon";
import * as fsutils from "./fsutils";

describe("env", () => {
  let env: typeof import("./env");

  beforeEach(() => {
    // Reload the env module to reset internal caches
    delete require.cache[require.resolve("./env")];
    env = require("./env") as typeof import("./env");
  });

  describe("detectAIAgent", () => {
    let envStub: sinon.SinonStub;

    beforeEach(() => {
      // Stub process.env to an empty object for isolation
      envStub = sinon.stub(process, "env").value({});
    });

    afterEach(() => {
      envStub.restore();
    });

    it("should return UNKNOWN when no agent env vars are set", () => {
      expect(env.detectAIAgent()).to.equal(env.UNKNOWN);
    });

    it("should detect antigravity", () => {
      process.env["ANTIGRAVITY_CLI_ALIAS"] = "true";
      expect(env.detectAIAgent()).to.equal(env.ANTIGRAVITY);
    });

    it("should detect claude_code", () => {
      process.env["CLAUDECODE"] = "true";
      expect(env.detectAIAgent()).to.equal(env.CLAUDE_CODE);
    });

    it("should detect claude_code_cowork", () => {
      process.env["CLAUDECODE"] = "true";
      process.env["CLAUDE_CODE_IS_COWORK"] = "true";
      expect(env.detectAIAgent()).to.equal(env.CLAUDE_CODE_COWORK);
    });

    it("should detect cline", () => {
      process.env["CLINE_ACTIVE"] = "true";
      expect(env.detectAIAgent()).to.equal(env.CLINE);
    });

    it("should detect codex_cli", () => {
      process.env["CODEX_SANDBOX"] = "true";
      expect(env.detectAIAgent()).to.equal(env.CODEX_CLI);
    });

    it("should detect cursor", () => {
      process.env["CURSOR_AGENT"] = "true";
      expect(env.detectAIAgent()).to.equal(env.CURSOR);
    });

    it("should detect gemini_cli", () => {
      process.env["GEMINI_CLI"] = "true";
      expect(env.detectAIAgent()).to.equal(env.GEMINI_CLI);
    });

    it("should detect open_code", () => {
      process.env["OPENCODE"] = "true";
      expect(env.detectAIAgent()).to.equal(env.OPEN_CODE);
    });

    it("should detect replit", () => {
      process.env["REPLIT_USER"] = "user";
      expect(env.detectAIAgent()).to.equal(env.REPLIT);
    });

    it("should detect copilot", () => {
      process.env["COPILOT_MODEL"] = "gpt-4";
      expect(env.detectAIAgent()).to.equal(env.COPILOT);
    });

    it("should detect google_ai_studio", () => {
      process.env["APPLET_DIR"] = "/some/path";
      expect(env.detectAIAgent()).to.equal(env.GOOGLE_AI_STUDIO);
    });

    it("should detect cursor via alternative env vars", () => {
      process.env["CURSOR_TRACE_ID"] = "123";
      expect(env.detectAIAgent()).to.equal(env.CURSOR);

      delete process.env["CURSOR_TRACE_ID"];
      process.env["CODEX_THREAD_ID"] = "456";
      expect(env.detectAIAgent()).to.equal(env.CURSOR);

      delete process.env["CODEX_THREAD_ID"];
      process.env["CODEX_SANDBOX_NETWORK_DISABLED"] = "true";
      expect(env.detectAIAgent()).to.equal(env.CURSOR);
    });

    it("should detect open_code via OPENCODE_CLIENT", () => {
      process.env["OPENCODE_CLIENT"] = "true";
      expect(env.detectAIAgent()).to.equal(env.OPEN_CODE);
    });

    it("should detect replit via REPL_ID", () => {
      process.env["REPL_ID"] = "abc-123";
      expect(env.detectAIAgent()).to.equal(env.REPLIT);
    });
  });

  describe("isFirebaseMcp", () => {
    it("should reflect setFirebaseMcp value", () => {
      env.setFirebaseMcp(true);
      expect(env.isFirebaseMcp()).to.be.true;
      env.setFirebaseMcp(false);
      expect(env.isFirebaseMcp()).to.be.false;
    });
  });

  describe("isFirebaseStudio", () => {
    let dirExistsSyncStub: sinon.SinonStub;

    beforeEach(() => {
      dirExistsSyncStub = sinon.stub(fsutils, "dirExistsSync");
    });

    afterEach(() => {
      dirExistsSyncStub.restore();
    });

    it("should return true if MONOSPACE_ENV is set", () => {
      const envStub = sinon.stub(process, "env").value({ MONOSPACE_ENV: "true" });
      expect(env.isFirebaseStudio()).to.be.true;
      envStub.restore();
    });

    it("should return true if /google/idx exists", () => {
      dirExistsSyncStub.withArgs("/google/idx").returns(true);
      expect(env.isFirebaseStudio()).to.be.true;
    });
  });
});
