import { expect } from "chai";
import * as sinon from "sinon";
import { command } from "./firestore-operations-describe";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";

describe("firestore:operations:describe", () => {
  const sandbox = sinon.createSandbox();
  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let loggerInfoStub: sinon.SinonStub;
  let prettyPrintStub: sinon.SinonStub;

  beforeEach(() => {
    firestoreApiStub = sandbox.createStubInstance(fsi.FirestoreApi);
    sandbox.stub(fsi, "FirestoreApi").returns(firestoreApiStub);
    loggerInfoStub = sandbox.stub(logger, "info");
    prettyPrintStub = sandbox.stub(PrettyPrint.prototype, "prettyPrintOperation");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should call the Firestore API with the correct parameters", async () => {
    const options = { project: "test-project", database: "test-db" };
    const operationName = "test-operation";
    firestoreApiStub.describeOperation.resolves({ name: "op1", done: false, metadata: {} });

    await command.runner()(operationName, options);

    expect(firestoreApiStub.describeOperation).to.be.calledOnceWith(
      "test-project",
      "test-db",
      operationName,
    );
  });

  it("should use default values for database if not provided", async () => {
    const options = { project: "test-project" };
    const operationName = "test-operation";
    firestoreApiStub.describeOperation.resolves({ name: "op1", done: false, metadata: {} });

    await command.runner()(operationName, options);

    expect(firestoreApiStub.describeOperation).to.be.calledOnceWith(
      "test-project",
      "(default)",
      operationName,
    );
  });

  it("should print the operation in JSON format when --json is specified", async () => {
    const options = { project: "test-project", json: true };
    const operationName = "test-operation";
    const operation = { name: "op1", done: false, metadata: {} };
    firestoreApiStub.describeOperation.resolves(operation);

    await command.runner()(operationName, options);

    expect(loggerInfoStub).to.be.calledOnceWith(JSON.stringify(operation, undefined, 2));
    expect(prettyPrintStub).to.not.be.called;
  });

  it("should pretty-print the operation when --json is not specified", async () => {
    const options = { project: "test-project" };
    const operationName = "test-operation";
    const operation = { name: "op1", done: false, metadata: {} };
    firestoreApiStub.describeOperation.resolves(operation);

    await command.runner()(operationName, options);

    expect(prettyPrintStub).to.be.calledOnceWith(operation);
    expect(loggerInfoStub).to.not.be.called;
  });

  it("should throw a FirebaseError if project is not defined", async () => {
    const options = {};
    const operationName = "test-operation";
    await expect(command.runner()(operationName, options)).to.be.rejectedWith(
      FirebaseError,
      "Project is not defined. Either use `--project` or use `firebase use` to set your active project.",
    );
  });

  it("should throw a FirebaseError if operation name is invalid", async () => {
    const options = { project: "test-project" };
    await expect(command.runner()("", options)).to.be.rejectedWith(
      FirebaseError,
      '"" is not a valid operation name.',
    );
    await expect(command.runner()("projects/p/databases/d", options)).to.be.rejectedWith(
      FirebaseError,
      '"projects/p/databases/d" is not a valid operation name.',
    );
    await expect(
      command.runner()("projects/p/databases/d/operations/", options),
    ).to.be.rejectedWith(
      FirebaseError,
      '"projects/p/databases/d/operations/" is not a valid operation name.',
    );
  });
});
