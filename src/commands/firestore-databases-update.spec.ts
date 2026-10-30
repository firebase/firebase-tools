import * as sinon from "sinon";
import { expect } from "chai";
import { Command } from "../command";
import { command as firestoreDatabasesUpdate } from "./firestore-databases-update";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as requireAuthModule from "../requireAuth";

describe("firestore:databases:update", () => {
  const PROJECT = "test-project";
  const DATABASE = "test-database";
  const LOCATION = "nam5";
  const OPERATION_NAME = `projects/${PROJECT}/databases/${DATABASE}/operations/op-123`;

  let command: Command;
  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let requireAuthStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    command = firestoreDatabasesUpdate;
    firestoreApiStub = sinon.createStubInstance(fsi.FirestoreApi);
    requireAuthStub = sinon.stub(requireAuthModule, "requireAuth");
    loggerInfoStub = sinon.stub(logger, "info");
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

  const mockOperation = (overrides: Partial<types.Operation>): types.Operation => {
    return {
      name: OPERATION_NAME,
      done: true,
      metadata: {},
      ...overrides,
    };
  };

  it("should throw an error if no properties to update are provided", async () => {
    const options = {
      project: PROJECT,
    };

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      "Missing properties to update",
    );
  });

  it("should update delete protection state", async () => {
    const options = {
      project: PROJECT,
      deleteProtection: "ENABLED",
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({
      deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
    });
    firestoreApiStub.updateDatabase.resolves(mockOperation({ response: expectedDatabase }));

    const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

    expect(result).to.deep.equal(expectedDatabase);
    sinon.assert.calledOnceWithExactly(firestoreApiStub.updateDatabase, PROJECT, DATABASE, {
      deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
      pointInTimeRecoveryEnablement: undefined,
      realtimeUpdatesMode: undefined,
    });
  });

  it("should update point-in-time recovery enablement", async () => {
    const options = {
      project: PROJECT,
      pointInTimeRecovery: "ENABLED",
      json: true,
    };
    const expectedDatabase = mockDatabaseResp({
      pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.ENABLED,
    });
    firestoreApiStub.updateDatabase.resolves(mockOperation({ response: expectedDatabase }));

    const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

    expect(result).to.deep.equal(expectedDatabase);
    sinon.assert.calledOnceWithExactly(firestoreApiStub.updateDatabase, PROJECT, DATABASE, {
      deleteProtectionState: undefined,
      pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.ENABLED,
      realtimeUpdatesMode: undefined,
    });
  });

  it("should return the operation when the update is still in progress", async () => {
    const options = {
      project: PROJECT,
      pointInTimeRecovery: "ENABLED",
      json: true,
    };
    const inProgressOperation = mockOperation({ done: false });
    firestoreApiStub.updateDatabase.resolves(inProgressOperation);

    const result = (await command.runner()(DATABASE, options)) as types.Operation;

    expect(result).to.deep.equal(inProgressOperation);
    sinon.assert.calledWith(
      loggerInfoStub,
      `firebase firestore:operations:describe --database="${DATABASE}" ${OPERATION_NAME}`,
    );
  });

  it("should throw the operation error when the update failed", async () => {
    const options = {
      project: PROJECT,
      deleteProtection: "ENABLED",
    };
    firestoreApiStub.updateDatabase.resolves(
      mockOperation({
        error: { name: "INTERNAL", code: 13, message: "Something went wrong" },
      }),
    );

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      `Failed to update database ${DATABASE}: Something went wrong`,
    );
  });

  it("should fall back to a generic message when the operation error has no message", async () => {
    const options = {
      project: PROJECT,
      deleteProtection: "ENABLED",
    };
    firestoreApiStub.updateDatabase.resolves(
      mockOperation({
        error: { name: "INTERNAL", code: 13, message: "" },
      }),
    );

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      `Failed to update database ${DATABASE}: Unknown error`,
    );
  });

  it("should throw when a completed operation has no database in its response", async () => {
    const options = {
      project: PROJECT,
      deleteProtection: "ENABLED",
    };
    firestoreApiStub.updateDatabase.resolves(mockOperation({}));

    await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
      FirebaseError,
      "Not found",
    );
  });

  // The firestorewatchmutability experiment only controls whether --realtime-updates is
  // registered when the module loads (Commander rejects the flag when the experiment is off).
  // The action never reads the experiment, so these tests don't toggle it.
  describe("with --realtime-updates", () => {
    it("should update realtimeUpdates to ENABLED", async () => {
      const options = {
        project: PROJECT,
        realtimeUpdates: "ENABLED",
        json: true,
      };
      const inProgressOperation = mockOperation({ done: false });
      firestoreApiStub.updateDatabase.resolves(inProgressOperation);

      const result = (await command.runner()(DATABASE, options)) as types.Operation;

      expect(result).to.deep.equal(inProgressOperation);
      sinon.assert.calledOnceWithExactly(firestoreApiStub.updateDatabase, PROJECT, DATABASE, {
        deleteProtectionState: undefined,
        pointInTimeRecoveryEnablement: undefined,
        realtimeUpdatesMode: types.RealtimeUpdatesMode.ENABLED,
      });
    });

    it("should update realtimeUpdates to DISABLED", async () => {
      const options = {
        project: PROJECT,
        realtimeUpdates: "DISABLED",
        json: true,
      };
      const expectedDatabase = mockDatabaseResp({
        realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
      });
      firestoreApiStub.updateDatabase.resolves(mockOperation({ response: expectedDatabase }));

      const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

      expect(result).to.deep.equal(expectedDatabase);
      sinon.assert.calledOnceWithExactly(firestoreApiStub.updateDatabase, PROJECT, DATABASE, {
        deleteProtectionState: undefined,
        pointInTimeRecoveryEnablement: undefined,
        realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
      });
    });

    it("should update multiple properties including realtimeUpdates", async () => {
      const options = {
        project: PROJECT,
        deleteProtection: "ENABLED",
        pointInTimeRecovery: "DISABLED",
        realtimeUpdates: "DISABLED",
        json: true,
      };
      const expectedDatabase = mockDatabaseResp({
        deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
      });
      firestoreApiStub.updateDatabase.resolves(mockOperation({ response: expectedDatabase }));

      const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

      expect(result).to.deep.equal(expectedDatabase);
      sinon.assert.calledOnceWithExactly(firestoreApiStub.updateDatabase, PROJECT, DATABASE, {
        deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
      });
    });

    it("should throw an error for invalid realtimeUpdates option", async () => {
      const options = {
        project: PROJECT,
        realtimeUpdates: "INVALID",
      };

      await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
        FirebaseError,
        "Invalid value for flag --realtime-updates",
      );
    });
  });
});
