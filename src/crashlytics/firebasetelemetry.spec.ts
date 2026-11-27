import { expect } from "chai";
import nock from "../test/helpers/nock";
import * as firebasetelemetry from "./firebasetelemetry";
import { firebaseTelemetryAdminOrigin } from "../api";
import { FirebaseError } from "../error";

describe("firebasetelemetry", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("createOrUpdateTelemetryConfig", () => {
    const reqConfig = {
      name: "projects/test-project/locations/global/configs/1-123-web-456",
      appId: "1:123:web:456",
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
          "/v1alpha/projects/test-project/locations/global/configs/1-123-web-456?updateMask=samplingRate",
          reqConfig,
        )
        .reply(200, resConfig);

      const res = await firebasetelemetry.createOrUpdateTelemetryConfig(
        "test-project",
        "1:123:web:456",
        1,
      );

      expect(res).to.deep.equal(resConfig);
    });

    it("should reject when creation fails with 503 error", async () => {
      nock(firebaseTelemetryAdminOrigin())
        .post(
          "/v1alpha/projects/test-project/locations/global/configs?configId=1-123-web-456",
          reqConfig,
        )
        .reply(503, { error: { message: "Service Unavailable" } });

      await expect(
        firebasetelemetry.createOrUpdateTelemetryConfig("test-project", "1:123:web:456", 1),
      ).to.be.rejectedWith(
        FirebaseError,
        "Sorry, Crashlytics is busy right now and can't finish setup. Please try again in a little while.",
      );
    });

    it("should reject when creation fails with generic error", async () => {
      nock(firebaseTelemetryAdminOrigin())
        .post("/v1alpha/projects/test-project/locations/global/configs?configId=1-123-web-456")
        .reply(500, { error: "internal" });

      await expect(
        firebasetelemetry.createOrUpdateTelemetryConfig("test-project", "1:123:web:456", 1),
      ).to.be.rejectedWith(
        FirebaseError,
        "Failed to configure telemetry for web app 1:123:web:456 (status 500):",
      );
    });
  });
});
