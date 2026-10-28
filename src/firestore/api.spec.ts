import { expect } from "chai";
import nock from "../test/helpers/nock";

import { firestoreOrigin } from "../api";
import { FirebaseError } from "../error";
import { FirestoreApi } from "./api";
import * as types from "./api-types";

describe("FirestoreApi", () => {
  const project = "my-project";
  const databaseId = "my-database";
  const databasePath = `/v1/projects/${project}/databases/${databaseId}`;
  const operationName = `projects/${project}/databases/${databaseId}/operations/op-123`;

  let api: FirestoreApi;

  beforeEach(() => {
    api = new FirestoreApi();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("updateDatabase", () => {
    const expectedDatabase: types.DatabaseResp = {
      name: `projects/${project}/databases/${databaseId}`,
      uid: "db-uid",
      createTime: "2026-01-01T00:00:00Z",
      updateTime: "2026-01-02T00:00:00Z",
      locationId: "us-central1",
      type: types.DatabaseType.FIRESTORE_NATIVE,
      databaseEdition: types.DatabaseEdition.STANDARD,
      concurrencyMode: "PESSIMISTIC",
      appEngineIntegrationMode: "DISABLED",
      keyPrefix: "",
      deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
      pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.ENABLED,
      versionRetentionPeriod: "604800s",
      earliestVersionTime: "2026-01-01T00:00:00Z",
      realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
      firestoreDataAccessMode: types.DataAccessMode.ENABLED,
      mongodbCompatibleDataAccessMode: types.DataAccessMode.DISABLED,
      etag: "etag-1",
    };

    it("should poll the LRO when the initial PATCH response is not done", async () => {
      nock(firestoreOrigin())
        .patch(databasePath, {
          realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
        })
        .query({ updateMask: "realtime_updates_mode" })
        .reply(200, {
          name: operationName,
          metadata: {
            "@type": "type.googleapis.com/google.firestore.admin.v1.UpdateDatabaseMetadata",
          },
          done: false,
        });
      nock(firestoreOrigin()).get(`/v1/${operationName}`).reply(200, {
        name: operationName,
        done: false,
      });
      nock(firestoreOrigin()).get(`/v1/${operationName}`).reply(200, {
        name: operationName,
        done: true,
        response: expectedDatabase,
      });

      const result = await api.updateDatabase(
        project,
        databaseId,
        undefined,
        undefined,
        types.RealtimeUpdatesMode.DISABLED,
      );

      expect(result).to.deep.equal(expectedDatabase);
      expect(nock.isDone()).to.be.true;
    });

    it("should return the database immediately when the initial PATCH response is already done", async () => {
      nock(firestoreOrigin())
        .patch(databasePath, {
          deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
        })
        .query({ updateMask: "delete_protection_state" })
        .reply(200, {
          name: operationName,
          done: true,
          response: expectedDatabase,
        });

      const result = await api.updateDatabase(
        project,
        databaseId,
        types.DatabaseDeleteProtectionState.ENABLED,
      );

      expect(result).to.deep.equal(expectedDatabase);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw FirebaseError when the polled LRO fails with an error", async () => {
      nock(firestoreOrigin())
        .patch(databasePath, {
          realtimeUpdatesMode: types.RealtimeUpdatesMode.ENABLED,
        })
        .query({ updateMask: "realtime_updates_mode" })
        .reply(200, {
          name: operationName,
          done: false,
        });
      nock(firestoreOrigin())
        .get(`/v1/${operationName}`)
        .reply(200, {
          name: operationName,
          done: true,
          error: {
            code: 13,
            message: "Failed to provision CLC pool",
          },
        });

      await expect(
        api.updateDatabase(
          project,
          databaseId,
          undefined,
          undefined,
          types.RealtimeUpdatesMode.ENABLED,
        ),
      ).to.be.rejectedWith(FirebaseError, "Failed to provision CLC pool");
      expect(nock.isDone()).to.be.true;
    });

    it("should throw FirebaseError when a completed response has no database payload", async () => {
      nock(firestoreOrigin())
        .patch(databasePath, {
          deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        })
        .query({ updateMask: "delete_protection_state" })
        .reply(200, {
          name: operationName,
          done: true,
        });

      await expect(
        api.updateDatabase(project, databaseId, types.DatabaseDeleteProtectionState.DISABLED),
      ).to.be.rejectedWith(FirebaseError, "Not found");
      expect(nock.isDone()).to.be.true;
    });
  });
});
