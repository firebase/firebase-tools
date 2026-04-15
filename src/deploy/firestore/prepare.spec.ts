import { expect } from "chai";
import * as sinon from "sinon";
import prepare from "./prepare";
import { RulesDeploy } from "../../rulesDeploy";
import { FirestoreApi } from "../../firestore/api";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as fsConfig from "../../firestore/fsConfig";
import { FirebaseError } from "../../error";

describe("deploy/firestore/prepare", () => {
  let getFirestoreConfigStub: sinon.SinonStub;
  let compileStub: sinon.SinonStub;
  let getDatabaseStub: sinon.SinonStub;
  let createDatabaseStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(ensureApiEnabled, "ensure").resolves();
    getFirestoreConfigStub = sinon.stub(fsConfig, "getFirestoreConfig").returns([]);
    compileStub = sinon.stub(RulesDeploy.prototype, "compile").resolves();
    sinon.stub(RulesDeploy.prototype, "addFile").returns();
    getDatabaseStub = sinon.stub(FirestoreApi.prototype, "getDatabase").resolves();
    createDatabaseStub = sinon.stub(FirestoreApi.prototype, "createDatabase").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should exit early if no firestore configs are found", async () => {
    const context: any = { projectId: "my-project" };
    const options: any = { only: "" };

    await prepare(context, options);

    expect(context.firestore).to.be.undefined;
  });

  it("should prepare filtering flags correctly for --only firestore", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)", rules: "firestore.rules" }]);
    const context: any = { projectId: "my-project" };
    const options: any = {
      only: "firestore",
      config: { data: { firestore: {} }, path: () => "path" },
      projectId: "my-project",
    };

    await prepare(context, options);

    expect(context.firestoreRules).to.be.true;
    expect(context.firestoreIndexes).to.be.true;
  });

  it("should prepare filtering flags correctly for --only firestore:rules", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)", rules: "firestore.rules" }]);
    const context: any = { projectId: "my-project" };
    const options: any = {
      only: "firestore:rules",
      config: { data: { firestore: {} }, path: () => "path" },
      projectId: "my-project",
    };

    await prepare(context, options);

    expect(context.firestoreRules).to.be.true;
    expect(context.firestoreIndexes).to.be.false;
  });

  it("should create a missing database on preparation", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)", rules: "firestore.rules" }]);
    getDatabaseStub.rejects({ status: 404 } as unknown as Error);

    const context: any = { projectId: "my-project" };
    const options: any = {
      config: { data: { firestore: { database: "(default)" } }, path: () => "path" },
      projectId: "my-project",
    };

    await prepare(context, options);

    expect(createDatabaseStub).to.have.been.calledOnce;
    expect(compileStub).to.have.been.calledOnce;
  });

  it("should throw if invalid edition is specified", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)" }]);
    const context: any = { projectId: "my-project" };
    const options: any = {
      config: { data: { firestore: { edition: "INVALID_EDITION" } }, path: () => "path" },
      projectId: "my-project",
    };

    await expect(prepare(context, options)).to.be.rejectedWith(
      FirebaseError,
      /Invalid edition specified for database/,
    );
  });
});
