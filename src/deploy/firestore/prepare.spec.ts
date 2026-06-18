import { expect } from "chai";
import * as sinon from "sinon";
import { RulesDeploy } from "../../rulesDeploy";
import prepare, { RulesContext, IndexContext } from "./prepare";
import { DeployOptions } from "..";
import { FirestoreApi } from "../../firestore/api";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as fsConfig from "../../firestore/fsConfig";
import { FirebaseError } from "../../error";
import { Config } from "../../config";

function mockDeployOptions(overrides: Partial<DeployOptions>): DeployOptions {
  return {
    configPath: "configPath",
    only: "",
    except: [],
    filteredTargets: [],
    force: false,
    projectId: "my-project",
    config: new Config({ firestore: {} }, { projectDir: "." }),
    ...overrides,
  } as DeployOptions;
}

interface TestContext {
  projectId: string;
  firestoreIndexes?: boolean;
  firestoreRules?: boolean;
  firestore?: {
    rules: RulesContext[];
    indexes: IndexContext[];
    rulesDeploy?: RulesDeploy;
  };
}

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
    const context = { projectId: "my-project" } as TestContext;
    const options = mockDeployOptions({ only: "" });

    await prepare(context, options);

    expect(context.firestore).to.be.undefined;
  });

  it("should prepare filtering flags correctly for --only firestore", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)", rules: "firestore.rules" }]);
    const context = { projectId: "my-project" } as TestContext;
    const options = mockDeployOptions({
      only: "firestore",
      config: new Config({ firestore: {} }, { projectDir: "." }),
      projectId: "my-project",
    });

    await prepare(context, options);

    expect(context.firestoreRules).to.be.true;
    expect(context.firestoreIndexes).to.be.true;
  });

  it("should prepare filtering flags correctly for --only firestore:rules", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)", rules: "firestore.rules" }]);
    const context = { projectId: "my-project" } as TestContext;
    const options = mockDeployOptions({
      only: "firestore:rules",
      config: new Config({ firestore: {} }, { projectDir: "." }),
      projectId: "my-project",
    });

    await prepare(context, options);

    expect(context.firestoreRules).to.be.true;
    expect(context.firestoreIndexes).to.be.false;
  });

  it("should create a missing database on preparation", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)", rules: "firestore.rules" }]);
    getDatabaseStub.rejects(Object.assign(new Error("Not found"), { status: 404 }));

    const context = { projectId: "my-project" } as TestContext;
    const options = mockDeployOptions({
      config: new Config({ firestore: { database: "(default)" } }, { projectDir: "." }),
      projectId: "my-project",
    });

    await prepare(context, options);

    expect(createDatabaseStub).to.have.been.calledOnce;
    expect(createDatabaseStub).to.have.been.calledWith(sinon.match({ databaseId: "(default)" }));
    expect(compileStub).to.have.been.calledOnce;
  });

  it("should create database with detailed settings", async () => {
    getFirestoreConfigStub.returns([{ database: "test-db", rules: "firestore.rules" }]);
    getDatabaseStub.rejects(Object.assign(new Error("Not found"), { status: 404 }));

    const context = { projectId: "my-project" } as TestContext;
    const options = mockDeployOptions({
      config: new Config(
        {
          firestore: {
            database: "test-db",
            edition: "enterprise",
            dataAccessMode: "FIRESTORE_NATIVE",
          },
        },
        { projectDir: "." },
      ),
      projectId: "my-project",
    });

    await prepare(context, options);

    expect(createDatabaseStub).to.have.been.calledOnce;
    expect(createDatabaseStub).to.have.been.calledWith(
      sinon.match({
        databaseId: "test-db",
        databaseEdition: "ENTERPRISE",
        firestoreDataAccessMode: "DATA_ACCESS_MODE_ENABLED",
        mongodbCompatibleDataAccessMode: "DATA_ACCESS_MODE_DISABLED",
      }),
    );
  });

  it("should throw if invalid edition is specified", async () => {
    getFirestoreConfigStub.returns([{ database: "(default)" }]);
    const context = { projectId: "my-project" } as TestContext;
    const options = mockDeployOptions({
      config: new Config({ firestore: { edition: "INVALID_EDITION" } }, { projectDir: "." }),
      projectId: "my-project",
    });

    await expect(prepare(context, options)).to.be.rejectedWith(
      FirebaseError,
      /Invalid edition specified for database/,
    );
  });
});
