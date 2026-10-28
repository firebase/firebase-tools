import { expect } from "chai";
import * as nock from "nock";
import { firestoreOrigin } from "../api";
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
  });

  describe("updateDatabase", () => {
    it("should send only the requested field with a matching update mask", async () => {
      const inProgressOperation = {
        name: operationName,
        metadata: {
          "@type": "type.googleapis.com/google.firestore.admin.v1.UpdateDatabaseMetadata",
        },
        done: false,
      };
      nock(firestoreOrigin())
        .patch(databasePath, {
          realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
        })
        .query({ updateMask: "realtime_updates_mode" })
        .reply(200, inProgressOperation);

      const result = await api.updateDatabase(project, databaseId, {
        realtimeUpdatesMode: types.RealtimeUpdatesMode.DISABLED,
      });

      expect(result).to.deep.equal(inProgressOperation);
      expect(nock.isDone()).to.be.true;
    });

    it("should send all requested fields with a comma-separated update mask", async () => {
      const completedOperation = {
        name: operationName,
        done: true,
        response: { name: `projects/${project}/databases/${databaseId}` },
      };
      nock(firestoreOrigin())
        .patch(databasePath, {
          deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
          pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
          realtimeUpdatesMode: types.RealtimeUpdatesMode.ENABLED,
        })
        .query({
          updateMask:
            "delete_protection_state,point_in_time_recovery_enablement,realtime_updates_mode",
        })
        .reply(200, completedOperation);

      const result = await api.updateDatabase(project, databaseId, {
        deleteProtectionState: types.DatabaseDeleteProtectionState.ENABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
        realtimeUpdatesMode: types.RealtimeUpdatesMode.ENABLED,
      });

      expect(result).to.deep.equal(completedOperation);
      expect(nock.isDone()).to.be.true;
    });
  });
});
