import { expect } from "chai";
import * as sinon from "sinon";

import * as python from ".";
import * as pythonFunctions from "../../../../functions/python";

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

  describe("serveAdmin", () => {
    let delegate: python.Delegate;
    let runWithVirtualEnvStub: sinon.SinonStub;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, "python310");

      // Mock the modulesDir method
      sinon.stub(delegate, "modulesDir" as any).resolves("/mock/modules/dir");

      // Mock runWithVirtualEnv from the imported module
      runWithVirtualEnvStub = sinon.stub(pythonFunctions, "runWithVirtualEnv");

      // Store original environment
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
      sinon.restore();
    });

    it("should propagate process.env including GOOGLE_APPLICATION_CREDENTIALS", async () => {
      // Set up test environment variables
      process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/service-account.json";
      process.env.CUSTOM_VAR = "custom_value";

      const testEnvs = {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FUNCTION_TARGET: "test_function",
      };

      // Mock the runWithVirtualEnv function
      const mockChildProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        killed: false,
        kill: sinon.stub(),
        once: sinon.stub(),
      };
      runWithVirtualEnvStub.returns(mockChildProcess);

      await delegate.serveAdmin(8080, testEnvs);

      // Verify runWithVirtualEnv was called with correct environment
      expect(runWithVirtualEnvStub.calledOnce).to.be.true;
      const callArgs = runWithVirtualEnvStub.getCall(0).args;
      const passedEnvs = callArgs[2]; // Third argument is the environment

      // Verify process.env variables are included
      expect(passedEnvs.GOOGLE_APPLICATION_CREDENTIALS).to.equal("/path/to/service-account.json");
      expect(passedEnvs.CUSTOM_VAR).to.equal("custom_value");

      // Verify provided envs are included
      expect(passedEnvs.FIREBASE_PROJECT_ID).to.equal(PROJECT_ID);
      expect(passedEnvs.FUNCTION_TARGET).to.equal("test_function");

      // Verify ADMIN_PORT is set
      expect(passedEnvs.ADMIN_PORT).to.equal("8080");
    });

    it("should preserve process.env when no additional envs are provided", async () => {
      // Set up test environment variables
      process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/service-account.json";
      (process.env as any).NODE_ENV = "test";

      const mockChildProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        killed: false,
        kill: sinon.stub(),
        once: sinon.stub(),
      };
      runWithVirtualEnvStub.returns(mockChildProcess);

      await delegate.serveAdmin(8080, {});

      // Verify runWithVirtualEnv was called with correct environment
      expect(runWithVirtualEnvStub.calledOnce).to.be.true;
      const callArgs = runWithVirtualEnvStub.getCall(0).args;
      const passedEnvs = callArgs[2];

      // Verify process.env variables are preserved
      expect(passedEnvs.GOOGLE_APPLICATION_CREDENTIALS).to.equal("/path/to/service-account.json");
      expect(passedEnvs.NODE_ENV).to.equal("test");
      expect(passedEnvs.ADMIN_PORT).to.equal("8080");
    });

    it("should override process.env with provided envs when there are conflicts", async () => {
      // Set up conflicting environment variables
      process.env.GOOGLE_APPLICATION_CREDENTIALS = "/original/path.json";
      process.env.FIREBASE_PROJECT_ID = "original-project";

      const testEnvs = {
        GOOGLE_APPLICATION_CREDENTIALS: "/new/path.json",
        FIREBASE_PROJECT_ID: PROJECT_ID,
      };

      const mockChildProcess = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        killed: false,
        kill: sinon.stub(),
        once: sinon.stub(),
      };
      runWithVirtualEnvStub.returns(mockChildProcess);

      await delegate.serveAdmin(8080, testEnvs);

      // Verify runWithVirtualEnv was called with correct environment
      expect(runWithVirtualEnvStub.calledOnce).to.be.true;
      const callArgs = runWithVirtualEnvStub.getCall(0).args;
      const passedEnvs = callArgs[2];

      // Verify provided envs override process.env
      expect(passedEnvs.GOOGLE_APPLICATION_CREDENTIALS).to.equal("/new/path.json");
      expect(passedEnvs.FIREBASE_PROJECT_ID).to.equal(PROJECT_ID);
      expect(passedEnvs.ADMIN_PORT).to.equal("8080");
    });
  });
});
