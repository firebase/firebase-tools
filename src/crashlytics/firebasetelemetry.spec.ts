import { expect } from "chai";
import nock from "../test/helpers/nock";
import * as firebasetelemetry from "./firebasetelemetry";
import { firebaseTelemetryAdminOrigin } from "../api";
import { FirebaseError } from "../error";

describe("firebasetelemetry", () => {
  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("createOrUpdateTelemetryConfig", () => {
    const reqConfig = {
      name: "projects/test-project/locations/global/configs/1-123-web-456",
      appId: "1:123:web:456",
      logBucket: "projects/test-project/locations/global/buckets/firebase-telemetry",
      samplingRate: 1,
    };
    const resConfig = {
      ...reqConfig,
      enablementState: "ENABLED",
    };

    it("should resolve with config when creation succeeds", async () => {
      nock(firebaseTelemetryAdminOrigin())
        .post(
          "/v1alpha/projects/test-project/locations/global/configs?configId=1-123-web-456",
          reqConfig,
        )
        .reply(200, resConfig);

      const res = await firebasetelemetry.createOrUpdateTelemetryConfig(
        "test-project",
        "1:123:web:456",
        "projects/test-project/locations/global/buckets/firebase-telemetry",
        1,
      );

      expect(res).to.deep.equal(resConfig);
    });

    it("should fall back to patch when creation returns 409", async () => {
      nock(firebaseTelemetryAdminOrigin())
        .post(
          "/v1alpha/projects/test-project/locations/global/configs?configId=1-123-web-456",
          reqConfig,
        )
        .reply(409, { error: { status: "ALREADY_EXISTS" } });
      nock(firebaseTelemetryAdminOrigin())
        .patch(
          "/v1alpha/projects/test-project/locations/global/configs/1-123-web-456?updateMask=logBucket,samplingRate",
          reqConfig,
        )
        .reply(200, resConfig);

      const res = await firebasetelemetry.createOrUpdateTelemetryConfig(
        "test-project",
        "1:123:web:456",
        "projects/test-project/locations/global/buckets/firebase-telemetry",
        1,
      );

      expect(res).to.deep.equal(resConfig);
    });

    it("should reject when creation fails with non-409 error", async () => {
      nock(firebaseTelemetryAdminOrigin())
        .post("/v1alpha/projects/test-project/locations/global/configs?configId=1-123-web-456")
        .reply(500, { error: "internal" });

      await expect(
        firebasetelemetry.createOrUpdateTelemetryConfig(
          "test-project",
          "1:123:web:456",
          "projects/test-project/locations/global/buckets/firebase-telemetry",
          1,
        ),
      ).to.be.rejectedWith(
        FirebaseError,
        "Failed to configure telemetry for web app 1:123:web:456 (status 500):",
      );
    });
  });
});
