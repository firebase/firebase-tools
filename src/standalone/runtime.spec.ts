import { expect } from "chai";
import * as childProcess from "child_process";
import * as sinon from "sinon";

import * as runtime from "../../standalone/runtime";

describe("standalone runtime", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    delete (globalThis as any).appendToPath;
    delete (globalThis as any).getSafeCrossPlatformPath;
    sandbox.restore();
  });

  describe("normalizeShellScriptArgs", () => {
    it("strips npm's -- sentinel after -c", () => {
      expect(runtime.normalizeShellScriptArgs(["-c", "--", "npm install"])).to.deep.equal([
        "npm install",
      ]);
    });

    it("preserves a leading -- when it is not the -c sentinel", () => {
      expect(runtime.normalizeShellScriptArgs(["--", "npm install"])).to.deep.equal([
        "--",
        "npm install",
      ]);
    });

    it("preserves arguments after the command string", () => {
      expect(
        runtime.normalizeShellScriptArgs(["-c", "--", "node ./script.js", "--flag", "value"]),
      ).to.deep.equal(["node ./script.js", "--flag", "value"]);
    });
  });

  describe("Script_ShellJS", () => {
    let originalArgv: string[];
    let fakeChild: { on: sinon.SinonStub };
    let forkStub: sinon.SinonStub;
    let spawnStub: sinon.SinonStub;

    beforeEach(() => {
      originalArgv = process.argv;
      fakeChild = { on: sandbox.stub().returnsThis() };
      forkStub = sandbox.stub(childProcess, "fork").returns(fakeChild as any);
      spawnStub = sandbox.stub(childProcess, "spawn").returns(fakeChild as any);
      (globalThis as any).appendToPath = sandbox.stub();
      (globalThis as any).getSafeCrossPlatformPath = sandbox.stub().resolvesArg(1);
    });

    afterEach(() => {
      process.argv = originalArgv;
    });

    it("forks a relative node script with normalized args", async () => {
      process.argv = [
        process.execPath,
        "shell.js",
        "-c",
        "--",
        `${process.execPath} ./script.js --flag value`,
      ];

      await runtime.Script_ShellJS();

      expect(forkStub).to.have.been.calledOnceWithExactly(
        "./script.js",
        ["--flag", "value"],
        {
          env: process.env,
          cwd: process.cwd(),
          stdio: "inherit",
        },
      );
      expect(spawnStub).not.to.have.been.called;
    });

    it("resolves non-relative node script paths via getSafeCrossPlatformPath", async () => {
      const resolvedPath = "/resolved/path/to/script.js";
      (globalThis as any).getSafeCrossPlatformPath = sandbox.stub().resolves(resolvedPath);

      process.argv = [
        process.execPath,
        "shell.js",
        "-c",
        "--",
        `${process.execPath} script.js --flag value`,
      ];

      await runtime.Script_ShellJS();

      expect(forkStub).to.have.been.calledOnceWithExactly(
        resolvedPath,
        ["--flag", "value"],
        {
          env: process.env,
          cwd: process.cwd(),
          stdio: "inherit",
        },
      );
      expect(spawnStub).not.to.have.been.called;
    });

    it("spawns non-node runtimes via shell", async () => {
      process.argv = [
        process.execPath,
        "shell.js",
        "-c",
        "--",
        "npm install --save-dev typescript",
      ];

      await runtime.Script_ShellJS();

      expect(spawnStub).to.have.been.calledOnceWithExactly(
        "npm",
        ["install", "--save-dev", "typescript"],
        {
          env: process.env,
          cwd: process.cwd(),
          stdio: "inherit",
          shell: true,
        },
      );
      expect(forkStub).not.to.have.been.called;
    });
  });
});
