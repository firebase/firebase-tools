import { expect } from "chai";
import * as sinon from "sinon";
import { command } from "./firestore-operations-list";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";

describe("firestore:operations:list", () => {
  const sandbox = sinon.createSandbox();
  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let loggerInfoStub: sinon.SinonStub;
  let prettyPrintStub: sinon.SinonStub;

  beforeEach(() => {
    firestoreApiStub = sandbox.createStubInstance(fsi.FirestoreApi);
    sandbox.stub(fsi, "FirestoreApi").returns(firestoreApiStub);
    loggerInfoStub = sandbox.stub(logger, "info");
    prettyPrintStub = sandbox.stub(PrettyPrint.prototype, "prettyPrintOperations");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should call the Firestore API with the correct parameters", async () => {
    const options = { project: "test-project", database: "test-db", limit: 50 };
    firestoreApiStub.listOperations.resolves({ operations: [] });

    await command.runner()(options);

    expect(firestoreApiStub.listOperations).to.be.calledOnceWith("test-project", "test-db", 50);
  });

  it("should use default values for database and limit if not provided", async () => {
    const options = { project: "test-project" };
    firestoreApiStub.listOperations.resolves({ operations: [] });

    await command.runner()(options);

    expect(firestoreApiStub.listOperations).to.be.calledOnceWith("test-project", "(default)", 100);
  });

  it("should print operations in JSON format when --json is specified", async () => {
    const options = { project: "test-project", json: true };
    const operations = [
      { name: "op1", done: false, metadata: {} },
      { name: "op2", done: true, metadata: {} },
    ];
    firestoreApiStub.listOperations.resolves({ operations });

    await command.runner()(options);

    expect(loggerInfoStub).to.be.calledOnceWith(JSON.stringify(operations, undefined, 2));
    expect(prettyPrintStub).to.not.be.called;
  });

  it("should pretty-print operations when --json is not specified", async () => {
    const options = { project: "test-project" };
    const operations = [
      { name: "op1", done: false, metadata: {} },
      { name: "op2", done: true, metadata: {} },
    ];
    firestoreApiStub.listOperations.resolves({ operations });

    await command.runner()(options);

    expect(prettyPrintStub).to.be.calledOnceWith(operations);
    expect(loggerInfoStub).to.not.be.called;
  });

  it("should throw a FirebaseError if project is not defined", async () => {
    const options = {};
    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      "Project is not defined. Either use `--project` or use `firebase use` to set your active project.",
    );
  });
});
