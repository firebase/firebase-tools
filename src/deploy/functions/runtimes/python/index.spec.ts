import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

import { expect } from "chai";
import * as sinon from "sinon";

import * as python from ".";
import * as pythonRuntime from "../../../../functions/python";

const PROJECT_ID = "test-project";
const SOURCE_DIR = "/some/path/fns";

describe("PythonDelegate", () => {
  describe("getPythonBinary", () => {
    let platformMock: sinon.SinonStub;

    beforeEach(() => {
      platformMock = sinon.stub(process, "platform");
    });

    afterEach(() => {
      platformMock.restore();
    });

    it("returns specific version of the python binary corresponding to the runtime", () => {
      platformMock.value("darwin");
      const requestedRuntime = "python310";
      const delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, requestedRuntime);

      expect(delegate.getPythonBinary()).to.equal("python3.10");
    });

    it("always returns version-neutral, python.exe on windows", () => {
      platformMock.value("win32");
      const requestedRuntime = "python310";
      const delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, requestedRuntime);

      expect(delegate.getPythonBinary()).to.equal("python.exe");
    });
  });

  describe("discovery subprocess environment", () => {
    let sandbox: sinon.SinonSandbox;
    let platformMock: sinon.SinonStub;
    let runWithVirtualEnvStub: sinon.SinonStub;
    let originalTestEnvVar: string | undefined;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      platformMock = sandbox.stub(process, "platform");
      platformMock.value("darwin");
      originalTestEnvVar = process.env.SOME_PARENT_SHELL_VAR;
      process.env.SOME_PARENT_SHELL_VAR = "inherited-value";
      runWithVirtualEnvStub = sandbox.stub(pythonRuntime, "runWithVirtualEnv");
    });

    afterEach(() => {
      sandbox.restore();
      if (originalTestEnvVar === undefined) {
        delete process.env.SOME_PARENT_SHELL_VAR;
      } else {
        process.env.SOME_PARENT_SHELL_VAR = originalTestEnvVar;
      }
    });

    function fakeExitingProcess(stdout: string): ChildProcess {
      const fakeProcess = new EventEmitter() as ChildProcess;
      (fakeProcess as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
      (fakeProcess as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
      setImmediate(() => {
        (fakeProcess.stdout as unknown as EventEmitter).emit("data", Buffer.from(stdout));
        fakeProcess.emit("exit", 0);
      });
      return fakeProcess;
    }

    it("modulesDir() inherits the parent shell environment", async () => {
      runWithVirtualEnvStub.returns(
        fakeExitingProcess("/some/path/fns/venv/lib/firebase_functions"),
      );

      const delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, "python311");
      await delegate.modulesDir();

      expect(runWithVirtualEnvStub).to.have.been.calledOnce;
      const [, , envs] = runWithVirtualEnvStub.firstCall.args;
      expect(envs.SOME_PARENT_SHELL_VAR).to.equal("inherited-value");
    });

    it("serveAdmin() inherits the parent shell environment", async () => {
      runWithVirtualEnvStub
        .onCall(0)
        .returns(fakeExitingProcess("/some/path/fns/venv/lib/firebase_functions"));
      runWithVirtualEnvStub.onCall(1).returns(new EventEmitter() as ChildProcess);

      const delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, "python311");
      await delegate.serveAdmin(8081, {
        FUNCTION_TARGET: "hello_world",
        SOME_PARENT_SHELL_VAR: "overriden-value",
      });

      expect(runWithVirtualEnvStub).to.have.been.calledTwice;
      const [, , envs] = runWithVirtualEnvStub.secondCall.args;
      expect(envs.SOME_PARENT_SHELL_VAR).to.equal("overriden-value");
      expect(envs.FUNCTION_TARGET).to.equal("hello_world");
      expect(envs.ADMIN_PORT).to.equal("8081");
    });
  });
});
