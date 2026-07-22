import { expect } from "chai";
import * as sinon from "sinon";
import { errorOut } from "./errorOut";
import { FirebaseError } from "./error";
import * as logError from "./logError";

describe("errorOut", () => {
  let sandbox: sinon.SinonSandbox;
  let logErrorStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    logErrorStub = sandbox.stub(logError, "logError");
    clock = sandbox.useFakeTimers();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should log a FirebaseError and exit with the correct code", () => {
    const error = new FirebaseError("A Firebase error has occurred.", { exit: 123 });
    const processExitStub = sandbox.stub(process, "exit");
    errorOut(error);
    expect(logErrorStub).to.have.been.calledWith(error);
    expect(process.exitCode).to.equal(123);
    clock.tick(251);
    expect(processExitStub).to.have.been.calledOnce;
  });

  it("should wrap a standard Error in a FirebaseError and exit with code 2", () => {
    const error = new Error("A standard error has occurred.");
    const processExitStub = sandbox.stub(process, "exit");
    errorOut(error);
    expect(logErrorStub).to.have.been.calledWith(sinon.match.instanceOf(FirebaseError));
    expect(logErrorStub.getCall(0).args[0].original).to.equal(error);
    expect(process.exitCode).to.equal(2);
    clock.tick(251);
    expect(processExitStub).to.have.been.calledOnce;
  });

  it("should exit with code 2 if exit code is 0", () => {
    const error = new FirebaseError("An error with exit code 0.", { exit: 0 });
    const processExitStub = sandbox.stub(process, "exit");
    errorOut(error);
    expect(logErrorStub).to.have.been.calledWith(error);
    expect(process.exitCode).to.equal(2);
    clock.tick(251);
    expect(processExitStub).to.have.been.calledOnce;
  });
});
