import * as sinon from "sinon";
import { expect } from "chai";
import { Command } from "../command";
import { command as firestoreDatabasesCreate } from "./firestore-databases-create";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { FirebaseError } from "../error";
import * as requireAuthModule from "../requireAuth";

describe("firestore:databases:create", () => {
  const PROJECT = "test-project";
  const DATABASE = "test-database";
  const LOCATION = "nam5";

  let command: Command;
  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    command = firestoreDatabasesCreate;
    firestoreApiStub = sinon.createStubInstance(fsi.FirestoreApi);
    requireAuthStub = sinon.stub(requireAuthModule, "requireAuth");
    sinon.stub(fsi, "FirestoreApi").returns(firestoreApiStub);
    requireAuthStub.resolves("a@b.com");
  });

  afterEach(() => {
    sinon.restore();
  });

  const mockDatabaseResp = (overrides: Partial<types.DatabaseResp>): types.DatabaseResp => {
    return {
      name: `projects/${PROJECT}/databases/${DATABASE}`,
      uid: "test-uid",
      createTime: "2025-07-28T12:00:00Z",
      updateTime: "2025-07-28T12:00:00Z",
      locationId: LOCATION,
      type: types.DatabaseType.FIRESTORE_NATIVE,
      databaseEdition: types.DatabaseEdition.STANDARD,
      concurrencyMode: "OPTIMISTIC",
      appEngineIntegrationMode: "DISABLED",
      keyPrefix: `projects/${PROJECT}/databases/${DATABASE}`,
      deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
      pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
      etag: "test-etag",
      versionRetentionPeriod: "1h",
      earliestVersionTime: "2025-07-28T11:00:00Z",
      realtimeUpdatesMode: types.RealtimeUpdatesMode.ENABLED,
      firestoreDataAccessMode: types.DataAccessMode.ENABLED,
      mongodbCompatibleDataAccessMode: types.DataAccessMode.DISABLED,
      ...overrides,
    };
  };

  it("should create a new database with the correct parameters", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({});
    firestoreApiStub.createDatabase.resolves(expectedDatabase);

    const result = await command.runner()(DATABASE, options);

    expect(result).to.deep.equal(expectedDatabase);
    expect(
      firestoreApiStub.createDatabase.calledOnceWith({
        project: PROJECT,
        databaseId: DATABASE,
        locationId: LOCATION,
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: types.DatabaseEdition.STANDARD,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: undefined,
        firestoreDataAccessMode: undefined,
        mongodbCompatibleDataAccessMode: undefined,
        cmekConfig: undefined,
      }),
    ).to.be.true;
  });

  it("should throw an error if location is not provided", async () => {
    const options = {
      project: PROJECT,
    };

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      "Missing required flag --location",
    );
  });

  it("should throw an error for invalid delete protection option", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      deleteProtection: "INVALID",
    };

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      "Invalid value for flag --delete-protection",
    );
  });

  it("should throw an error for invalid point-in-time recovery option", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      pointInTimeRecovery: "INVALID",
    };

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      "Invalid value for flag --point-in-time-recovery",
    );
  });

  it("should throw an error for invalid edition option", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      edition: "INVALID",
    };

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      "Invalid value for flag --edition",
    );
  });

  it("should create a database with enterprise edition", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      edition: "enterprise",
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({
      databaseEdition: types.DatabaseEdition.ENTERPRISE,
    });
    firestoreApiStub.createDatabase.resolves(expectedDatabase);

    const result = await command.runner()(DATABASE, options);

    expect(result).to.deep.equal(expectedDatabase);
    expect(
      firestoreApiStub.createDatabase.calledOnceWith({
        project: PROJECT,
        databaseId: DATABASE,
        locationId: LOCATION,
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: types.DatabaseEdition.ENTERPRISE,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: undefined,
        firestoreDataAccessMode: undefined,
        mongodbCompatibleDataAccessMode: undefined,
        cmekConfig: undefined,
      }),
    ).to.be.true;
  });

  it("should create a database with delete protection enabled", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      deleteProtection: "ENABLED",
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({
      deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
    });
    firestoreApiStub.createDatabase.resolves(expectedDatabase);

    const result = await command.runner()(DATABASE, options);

    expect(result).to.deep.equal(expectedDatabase);
    expect(
      firestoreApiStub.createDatabase.calledOnceWith({
        project: PROJECT,
        databaseId: DATABASE,
        locationId: LOCATION,
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: types.DatabaseEdition.STANDARD,
        deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: undefined,
        firestoreDataAccessMode: undefined,
        mongodbCompatibleDataAccessMode: undefined,
        cmekConfig: undefined,
      }),
    ).to.be.true;
  });

  it("should create a database with point-in-time recovery enabled", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      pointInTimeRecovery: "ENABLED",
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({
      pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.ENABLED,
    });
    firestoreApiStub.createDatabase.resolves(expectedDatabase);

    const result = await command.runner()(DATABASE, options);

    expect(result).to.deep.equal(expectedDatabase);
    expect(
      firestoreApiStub.createDatabase.calledOnceWith({
        project: PROJECT,
        databaseId: DATABASE,
        locationId: LOCATION,
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: types.DatabaseEdition.STANDARD,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.ENABLED,
        realtimeUpdatesMode: undefined,
        firestoreDataAccessMode: undefined,
        mongodbCompatibleDataAccessMode: undefined,
        cmekConfig: undefined,
      }),
    ).to.be.true;
  });

  it("should create a database with a KMS key", async () => {
    const KMS_KEY = "test-kms-key";
    const options = {
      project: PROJECT,
      location: LOCATION,
      kmsKeyName: KMS_KEY,
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({
      cmekConfig: {
        kmsKeyName: KMS_KEY,
      },
    });
    firestoreApiStub.createDatabase.resolves(expectedDatabase);

    const result = await command.runner()(DATABASE, options);

    expect(result).to.deep.equal(expectedDatabase);
    expect(
      firestoreApiStub.createDatabase.calledOnceWith({
        project: PROJECT,
        databaseId: DATABASE,
        locationId: LOCATION,
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: types.DatabaseEdition.STANDARD,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: undefined,
        firestoreDataAccessMode: undefined,
        mongodbCompatibleDataAccessMode: undefined,
        cmekConfig: {
          kmsKeyName: KMS_KEY,
        },
      }),
    ).to.be.true;
  });

  it("should handle firestoreDataAccess with realtimeUpdates ENABLED", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      edition: "enterprise",
      realtimeUpdates: "ENABLED",
      firestoreDataAccess: "ENABLED",
      mongodbCompatibleDataAccess: "DISABLED",
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({});
    firestoreApiStub.createDatabase.resolves(expectedDatabase);

    const result = await command.runner()(DATABASE, options);

    expect(result).to.deep.equal(expectedDatabase);
    expect(
      firestoreApiStub.createDatabase.calledOnceWith({
        project: PROJECT,
        databaseId: DATABASE,
        locationId: LOCATION,
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: types.DatabaseEdition.ENTERPRISE,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: types.RealtimeUpdatesMode.ENABLED,
        firestoreDataAccessMode: types.DataAccessMode.ENABLED,
        mongodbCompatibleDataAccessMode: types.DataAccessMode.DISABLED,
        cmekConfig: undefined,
      }),
    ).to.be.true;
  });

  it("should handle firestoreDataAccess with realtimeUpdates DISABLED", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
      edition: "enterprise",
      realtimeUpdates: "DISABLED",
      firestoreDataAccess: "ENABLED",
      mongodbCompatibleDataAccess: "DISABLED",
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({});
    firestoreApiStub.createDatabase.resolves(expectedDatabase);

    const result = await command.runner()(DATABASE, options);

    expect(result).to.deep.equal(expectedDatabase);
    expect(
      firestoreApiStub.createDatabase.calledOnceWith({
        project: PROJECT,
        databaseId: DATABASE,
        locationId: LOCATION,
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: types.DatabaseEdition.ENTERPRISE,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
        firestoreDataAccessMode: types.DataAccessMode.ENABLED,
        mongodbCompatibleDataAccessMode: types.DataAccessMode.DISABLED,
        cmekConfig: undefined,
      }),
    ).to.be.true;
  });

  it("should throw an error if the API call fails", async () => {
    const options = {
      project: PROJECT,
      location: LOCATION,
    };
    const apiError = new Error("API Error");
    firestoreApiStub.createDatabase.rejects(apiError);

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(apiError);
  });
});
