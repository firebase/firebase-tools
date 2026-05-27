import { expect } from "chai";
import * as sinon from "sinon";
import prepare from "./prepare";
import { FirestoreApi } from "../../firestore/api";
import * as types from "../../firestore/api-types";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as fsConfig from "../../firestore/fsConfig";
import * as loadCJSON from "../../loadCJSON";
import { RulesDeploy } from "../../rulesDeploy";

describe("firestore prepare", () => {
  let sandbox: sinon.SinonSandbox;
  let getDatabaseStub: sinon.SinonStub;
  let createDatabaseStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getDatabaseStub = sandbox.stub(FirestoreApi.prototype, "getDatabase");
    createDatabaseStub = sandbox.stub(FirestoreApi.prototype, "createDatabase");
    sandbox.stub(ensureApiEnabled, "ensure").resolves();
    sandbox.stub(loadCJSON, "loadCJSON").returns({});
    sandbox.stub(RulesDeploy.prototype, "addFile").returns();
    sandbox.stub(RulesDeploy.prototype, "compile").resolves();
    sandbox.stub(fsConfig, "getFirestoreConfig").returns([
      {
        database: "test-db",
        rules: "firestore.rules",
        indexes: "firestore.indexes.json",
      },
    ]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("createDatabase", () => {
    const projectId = "test-project";
    const options = {
      projectId,
      config: {
        path: (p: string) => p,
        data: {
          firestore: {
            database: "test-db",
          },
        },
      },
    } as unknown as Options;

    it("should create a database with default settings when dataAccessMode is missing", async () => {
      getDatabaseStub.rejects({ status: 404 });
      createDatabaseStub.resolves();

      // We need to call the default export which calls createDatabase internally
      await prepare({ projectId }, options);

      expect(createDatabaseStub.calledOnce).to.be.true;
      const args = createDatabaseStub.firstCall.args[0];
      expect(args.firestoreDataAccessMode).to.be.undefined;
      expect(args.mongodbCompatibleDataAccessMode).to.be.undefined;
      expect(args.databaseEdition).to.equal(types.DatabaseEdition.STANDARD);
    });

    it("should create a database with FIRESTORE_NATIVE when specified on enterprise edition", async () => {
      const enterpriseOptions = {
        projectId,
        config: {
          path: (p: string) => p,
          data: {
            firestore: {
              database: "test-db",
              edition: "enterprise",
              dataAccessMode: "FIRESTORE_NATIVE",
            },
          },
        },
      } as unknown as Options;
      getDatabaseStub.rejects({ status: 404 });
      createDatabaseStub.resolves();

      await prepare({ projectId }, enterpriseOptions);

      expect(createDatabaseStub.calledOnce).to.be.true;
      const args = createDatabaseStub.firstCall.args[0];
      expect(args.firestoreDataAccessMode).to.equal(types.DataAccessMode.ENABLED);
      expect(args.mongodbCompatibleDataAccessMode).to.equal(types.DataAccessMode.DISABLED);
      expect(args.databaseEdition).to.equal(types.DatabaseEdition.ENTERPRISE);
    });

    it("should create a database with MONGODB_COMPATIBLE when specified on enterprise edition", async () => {
      const enterpriseOptions = {
        projectId,
        config: {
          path: (p: string) => p,
          data: {
            firestore: {
              database: "test-db",
              edition: "enterprise",
              dataAccessMode: "MONGODB_COMPATIBLE",
            },
          },
        },
      } as unknown as Options;
      getDatabaseStub.rejects({ status: 404 });
      createDatabaseStub.resolves();

      await prepare({ projectId }, enterpriseOptions);

      expect(createDatabaseStub.calledOnce).to.be.true;
      const args = createDatabaseStub.firstCall.args[0];
      expect(args.firestoreDataAccessMode).to.equal(types.DataAccessMode.DISABLED);
      expect(args.mongodbCompatibleDataAccessMode).to.equal(types.DataAccessMode.ENABLED);
      expect(args.databaseEdition).to.equal(types.DatabaseEdition.ENTERPRISE);
    });

    it("should throw an error when dataAccessMode is specified on standard edition", async () => {
      const standardOptions = {
        projectId,
        config: {
          data: {
            firestore: {
              database: "test-db",
              edition: "standard",
              dataAccessMode: "MONGODB_COMPATIBLE",
            },
          },
        },
      } as unknown as Options;
      getDatabaseStub.rejects({ status: 404 });

      await expect(prepare({ projectId }, standardOptions)).to.be.rejectedWith(
        FirebaseError,
        "dataAccessMode can only be specified for enterprise edition databases.",
      );
    });

    it("should throw an error when dataAccessMode is specified without edition (defaults to standard)", async () => {
      const defaultOptions = {
        projectId,
        config: {
          data: {
            firestore: {
              database: "test-db",
              dataAccessMode: "MONGODB_COMPATIBLE",
            },
          },
        },
      } as unknown as Options;
      getDatabaseStub.rejects({ status: 404 });

      await expect(prepare({ projectId }, defaultOptions)).to.be.rejectedWith(
        FirebaseError,
        "dataAccessMode can only be specified for enterprise edition databases.",
      );
    });
  });
});
