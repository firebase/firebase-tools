import { expect } from "chai";
import * as sinon from "sinon";
import { command } from "./firestore-operations-cancel";
import * as fsi from "../firestore/api";
import * as prompt from "../prompt";
import * as utils from "../utils";

describe("firestore:operations:cancel", () => {
  const sandbox = sinon.createSandbox();
  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let confirmStub: sinon.SinonStub;
  let logSuccessStub: sinon.SinonStub;
  let logWarningStub: sinon.SinonStub;

  beforeEach(() => {
    firestoreApiStub = sandbox.createStubInstance(fsi.FirestoreApi);
    sandbox.stub(fsi, "FirestoreApi").returns(firestoreApiStub);
    confirmStub = sandbox.stub(prompt, "confirm");
    logSuccessStub = sandbox.stub(utils, "logSuccess");
    logWarningStub = sandbox.stub(utils, "logWarning");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should call the Firestore API with the correct parameters with --force", async () => {
    const options = { project: "test-project", database: "test-db", force: true };
    const operationName = "test-operation";
    firestoreApiStub.cancelOperation.resolves({ success: true });

    await command.runner()(operationName, options);

    expect(firestoreApiStub.cancelOperation).to.be.calledOnceWith(
      "test-project",
      "test-db",
      operationName,
    );
    expect(confirmStub).to.not.be.called;
  });

  it("should prompt for confirmation and continue if confirmed", async () => {
    const options = { project: "test-project", database: "test-db", force: false };
    const operationName = "test-operation";
    confirmStub.resolves(true);
    firestoreApiStub.cancelOperation.resolves({ success: true });

    await command.runner()(operationName, options);

    expect(confirmStub).to.be.calledOnce;
    expect(firestoreApiStub.cancelOperation).to.be.calledOnceWith(
      "test-project",
      "test-db",
      operationName,
    );
    expect(logSuccessStub).to.be.calledOnceWith("Operation cancelled successfully.");
  });

  it("should not cancel the operation if not confirmed", async () => {
    const options = { project: "test-project", database: "test-db", force: false };
    const operationName = "test-operation";
    confirmStub.resolves(false);

    await expect(command.runner()(operationName, options)).to.be.rejectedWith("Command aborted.");

    expect(confirmStub).to.be.calledOnce;
    expect(firestoreApiStub.cancelOperation).to.not.be.called;
  });

  it("should log a warning if operation cancellation fails", async () => {
    const options = { project: "test-project", database: "test-db", force: true };
    const operationName = "test-operation";
    firestoreApiStub.cancelOperation.resolves({ success: false });

    await command.runner()(operationName, options);

    expect(firestoreApiStub.cancelOperation).to.be.calledOnce;
    expect(logWarningStub).to.be.calledOnceWith("Canceling the operation failed.");
  });

  it("should print status in JSON format when --json is specified", async () => {
    const options = { project: "test-project", database: "test-db", force: true, json: true };
    const operationName = "test-operation";
    const status = { success: true };
    firestoreApiStub.cancelOperation.resolves(status);

    const jsonResult = await command.runner()(operationName, options);

    expect(jsonResult).to.eql(status);
  });
});
