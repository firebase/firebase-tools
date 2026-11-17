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
import * as utils from "../../utils";

describe("firestore prepare", () => {
  let sandbox: sinon.SinonSandbox;
  let getDatabaseStub: sinon.SinonStub;
  let createDatabaseStub: sinon.SinonStub;
  let compileStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getDatabaseStub = sandbox.stub(FirestoreApi.prototype, "getDatabase");
    createDatabaseStub = sandbox.stub(FirestoreApi.prototype, "createDatabase");
    sandbox.stub(ensureApiEnabled, "ensure").resolves();
    sandbox.stub(loadCJSON, "loadCJSON").returns({});
    sandbox.stub(RulesDeploy.prototype, "addFile").returns();
    compileStub = sandbox.stub(RulesDeploy.prototype, "compile").resolves();
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

  describe("dry run", () => {
    const projectId = "test-project";
    let logWarningStub: sinon.SinonStub;

    function dryRunOptions(firestore: Record<string, unknown>, dryRun = true): Options {
      return {
        projectId,
        dryRun,
        config: {
          path: (p: string) => p,
          data: { firestore },
        },
      } as unknown as Options;
    }

    beforeEach(() => {
      logWarningStub = sandbox.stub(utils, "logLabeledWarning");
    });

    it("should not create a missing database and should say where a deploy would create it", async () => {
      getDatabaseStub.rejects({ status: 404 });

      await prepare({ projectId }, dryRunOptions({ database: "test-db" }));

      expect(createDatabaseStub).to.not.have.been.called;
      expect(logWarningStub).to.have.been.calledOnce;
      const message = logWarningStub.firstCall.args[1] as string;
      expect(message).to.include("test-db");
      expect(message).to.include("nam5");
      expect(message).to.include("the default, because firebase.json sets no location");
      expect(compileStub).to.have.been.calledOnce;
    });

    it("should report the location from firebase.json", async () => {
      getDatabaseStub.rejects({ status: 404 });

      await prepare({ projectId }, dryRunOptions({ database: "test-db", location: "eur3" }));

      expect(createDatabaseStub).to.not.have.been.called;
      const message = logWarningStub.firstCall.args[1] as string;
      expect(message).to.include("eur3");
      expect(message).to.not.include("the default");
    });

    it("should not warn when the database already exists", async () => {
      getDatabaseStub.resolves({});

      await prepare({ projectId }, dryRunOptions({ database: "test-db" }));

      expect(createDatabaseStub).to.not.have.been.called;
      expect(logWarningStub).to.not.have.been.called;
    });

    it("should warn instead of failing when rules cannot be checked because no database exists", async () => {
      getDatabaseStub.rejects({ status: 404 });
      compileStub.rejects(new FirebaseError("permission denied", { status: 403 }));

      await prepare({ projectId }, dryRunOptions({ database: "test-db" }));

      expect(createDatabaseStub).to.not.have.been.called;
      expect(logWarningStub).to.have.been.calledTwice;
      expect(logWarningStub.secondCall.args[1]).to.include("Could not check the rules");
    });

    it("should still fail on rules compilation errors when no database exists", async () => {
      getDatabaseStub.rejects({ status: 404 });
      compileStub.rejects(new FirebaseError("Compilation error in firestore.rules", { exit: 1 }));

      await expect(
        prepare({ projectId }, dryRunOptions({ database: "test-db" })),
      ).to.be.rejectedWith(FirebaseError, "Compilation error in firestore.rules");
    });

    it("should still fail on a 403 from the rules check when the database exists", async () => {
      getDatabaseStub.resolves({});
      compileStub.rejects(new FirebaseError("permission denied", { status: 403 }));

      await expect(
        prepare({ projectId }, dryRunOptions({ database: "test-db" })),
      ).to.be.rejectedWith(FirebaseError, "permission denied");
    });

    it("should still create a missing database when it is not a dry run", async () => {
      getDatabaseStub.rejects({ status: 404 });
      createDatabaseStub.resolves();

      await prepare({ projectId }, dryRunOptions({ database: "test-db" }, false));

      expect(createDatabaseStub).to.have.been.calledOnce;
      const req = createDatabaseStub.firstCall.args[0] as types.CreateDatabaseReq;
      expect(req.locationId).to.equal("nam5");
      expect(logWarningStub).to.not.have.been.called;
    });
  });
});
