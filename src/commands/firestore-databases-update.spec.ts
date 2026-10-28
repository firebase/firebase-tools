import * as sinon from "sinon";
import { expect } from "chai";
import { Command } from "../command";
import * as experiments from "../experiments";
import { command as firestoreDatabasesUpdate } from "./firestore-databases-update";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { FirebaseError } from "../error";
import * as requireAuthModule from "../requireAuth";

describe("firestore:databases:update", () => {
  const PROJECT = "test-project";
  const DATABASE = "test-database";
  const LOCATION = "nam5";

  let command: Command;
  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    command = firestoreDatabasesUpdate;
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
    firestoreApiStub.updateDatabase.resolves(expectedDatabase);

    const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

    expect(result).to.deep.equal(expectedDatabase);
    sinon.assert.calledOnceWithExactly(
      firestoreApiStub.updateDatabase,
      PROJECT,
      DATABASE,
      types.DatabaseDeleteProtectionState.ENABLED,
      undefined,
      undefined,
    );
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
    firestoreApiStub.updateDatabase.resolves(expectedDatabase);

    const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

    expect(result).to.deep.equal(expectedDatabase);
    sinon.assert.calledOnceWithExactly(
      firestoreApiStub.updateDatabase,
      PROJECT,
      DATABASE,
      undefined,
      types.PointInTimeRecoveryEnablement.ENABLED,
      undefined,
    );
  });

  describe("with firestorewatchmutability experiment", () => {
    let wasEnabled: boolean;

    beforeEach(() => {
      wasEnabled = experiments.isEnabled("firestorewatchmutability");
    });

    afterEach(() => {
      experiments.setEnabled("firestorewatchmutability", wasEnabled);
    });

    it("should update realtimeUpdates to ENABLED when experiment is enabled", async () => {
      experiments.setEnabled("firestorewatchmutability", true);
      const options = {
        project: PROJECT,
        realtimeUpdates: "ENABLED",
        json: true,
      };
      const expectedDatabase = mockDatabaseResp({
        realtimeUpdatesMode: types.RealtimeUpdatesMode.ENABLED,
      });
      firestoreApiStub.updateDatabase.resolves(expectedDatabase);

      const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

      expect(result).to.deep.equal(expectedDatabase);
      sinon.assert.calledOnceWithExactly(
        firestoreApiStub.updateDatabase,
        PROJECT,
        DATABASE,
        undefined,
        undefined,
        types.RealtimeUpdatesMode.ENABLED,
      );
    });

    it("should update realtimeUpdates to DISABLED when experiment is enabled", async () => {
      experiments.setEnabled("firestorewatchmutability", true);
      const options = {
        project: PROJECT,
        realtimeUpdates: "DISABLED",
        json: true,
      };
      const expectedDatabase = mockDatabaseResp({
        realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
      });
      firestoreApiStub.updateDatabase.resolves(expectedDatabase);

      const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

      expect(result).to.deep.equal(expectedDatabase);
      sinon.assert.calledOnceWithExactly(
        firestoreApiStub.updateDatabase,
        PROJECT,
        DATABASE,
        undefined,
        undefined,
        types.RealtimeUpdatesMode.DISABLED,
      );
    });

    it("should update multiple properties including realtimeUpdates when experiment is enabled", async () => {
      experiments.setEnabled("firestorewatchmutability", true);
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
      firestoreApiStub.updateDatabase.resolves(expectedDatabase);

      const result = (await command.runner()(DATABASE, options)) as types.DatabaseResp;

      expect(result).to.deep.equal(expectedDatabase);
      sinon.assert.calledOnceWithExactly(
        firestoreApiStub.updateDatabase,
        PROJECT,
        DATABASE,
        types.DatabaseDeleteProtectionState.ENABLED,
        types.PointInTimeRecoveryEnablement.DISABLED,
        types.RealtimeUpdatesMode.DISABLED,
      );
    });

    it("should throw an error for invalid realtimeUpdates option when experiment is enabled", async () => {
      experiments.setEnabled("firestorewatchmutability", true);
      const options = {
        project: PROJECT,
        realtimeUpdates: "INVALID",
      };

      await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
        FirebaseError,
        "Invalid value for flag --realtime-updates",
      );
    });

    it("should throw an error when realtimeUpdates is set while experiment is disabled", async () => {
      experiments.setEnabled("firestorewatchmutability", false);
      const options = {
        project: PROJECT,
        realtimeUpdates: "DISABLED",
      };

      await expect(command.runner()(DATABASE, options)).to.be.rejectedWith(
        FirebaseError,
        "The --realtime-updates flag is only available when the 'firestorewatchmutability' experiment is enabled.",
      );
    });
  });
});
