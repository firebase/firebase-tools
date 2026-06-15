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
    it("uses normalized shell args when invoking node commands", async () => {
      const originalArgv = process.argv;
      const fakeChild = { on: sandbox.stub().returnsThis() };
      const forkStub = sandbox.stub(childProcess, "fork").returns(fakeChild as any);
      const spawnStub = sandbox.stub(childProcess, "spawn").returns(fakeChild as any);

      (globalThis as any).appendToPath = sandbox.stub();
      (globalThis as any).getSafeCrossPlatformPath = sandbox.stub().resolvesArg(1);

      process.argv = [
        process.execPath,
        "shell.js",
        "-c",
        "--",
        `${process.execPath} ./script.js --flag value`,
      ];

      try {
        await runtime.Script_ShellJS();
      } finally {
        process.argv = originalArgv;
      }

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
  });
});
