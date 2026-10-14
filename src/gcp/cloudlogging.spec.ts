import { expect } from "chai";
import nock from "../test/helpers/nock";

import * as cloudlogging from "./cloudlogging";
import { FirebaseError } from "../error";
import { cloudloggingOrigin } from "../api";

describe("cloudlogging", () => {
  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("listEntries", () => {
    it("should resolve with a list of log entries on success", async () => {
      const entries = [{ logName: "log1" }, { logName: "log2" }];
      nock(cloudloggingOrigin()).post("/v2/entries:list").reply(200, { entries });

      await expect(
        cloudlogging.listEntries("project", "filter", 10, "desc"),
      ).to.eventually.deep.equal({ entries, nextPageToken: undefined });
    });

    it("should reject if the API call fails", async () => {
      nock(cloudloggingOrigin()).post("/v2/entries:list").reply(404, { error: "not found" });

      await expect(cloudlogging.listEntries("project", "filter", 10, "desc")).to.be.rejectedWith(
        FirebaseError,
        "Failed to retrieve log entries from Google Cloud.",
      );
    });

    it("should include nextPageToken when provided", async () => {
      const entries = [{ logName: "log1" }];
      nock(cloudloggingOrigin())
        .post("/v2/entries:list", (body) => {
          expect(body.pageToken).to.equal("token");
          return true;
        })
        .reply(200, { entries, nextPageToken: "next" });

      await expect(
        cloudlogging.listEntries("project", "filter", 10, "asc", "token"),
      ).to.eventually.deep.equal({
        entries,
        nextPageToken: "next",
      });
    });
  });

  describe("createOrUpdateLogBucket", () => {
    it("should resolve with bucket when creation succeeds", async () => {
      const bucket = {
        name: "projects/project/locations/global/buckets/firebase-telemetry",
        analyticsEnabled: true,
      };
      nock(cloudloggingOrigin())
        .post("/v2/projects/project/locations/global/buckets?bucketId=firebase-telemetry", {
          analyticsEnabled: true,
        })
        .reply(200, bucket);

      await expect(
        cloudlogging.createOrUpdateLogBucket("project", "firebase-telemetry", "global", true),
      ).to.eventually.deep.equal(bucket);
    });

    it("should fall back to patch when creation returns 409", async () => {
      const bucket = {
        name: "projects/project/locations/global/buckets/firebase-telemetry",
        analyticsEnabled: true,
      };
      nock(cloudloggingOrigin())
        .post("/v2/projects/project/locations/global/buckets?bucketId=firebase-telemetry", {
          analyticsEnabled: true,
        })
        .reply(409, { error: { status: "ALREADY_EXISTS" } });
      nock(cloudloggingOrigin())
        .patch(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry?updateMask=analyticsEnabled",
          { analyticsEnabled: true },
        )
        .reply(200, bucket);

      await expect(
        cloudlogging.createOrUpdateLogBucket("project", "firebase-telemetry", "global", true),
      ).to.eventually.deep.equal(bucket);
    });

    it("should reject if API call fails with error other than 409", async () => {
      nock(cloudloggingOrigin())
        .post("/v2/projects/project/locations/global/buckets?bucketId=firebase-telemetry", {
          analyticsEnabled: true,
        })
        .reply(500, { error: "internal" });

      await expect(
        cloudlogging.createOrUpdateLogBucket("project", "firebase-telemetry", "global", true),
      ).to.be.rejectedWith(
        FirebaseError,
        "Failed to create or update log bucket firebase-telemetry (status 500):",
      );
    });

    it("should throw friendly error when billing account is missing", async () => {
      nock(cloudloggingOrigin())
        .post("/v2/projects/project/locations/global/buckets?bucketId=firebase-telemetry", {
          analyticsEnabled: true,
        })
        .reply(400, { error: { message: "Valid linked billing account is required" } });

      await expect(
        cloudlogging.createOrUpdateLogBucket("project", "firebase-telemetry", "global", true),
      ).to.be.rejectedWith(
        FirebaseError,
        "Creating a Cloud Logging bucket requires a valid linked billing account (Blaze plan). Please attach a billing account to project project and try again.",
      );
    });
  });

  describe("createOrUpdateLogSink", () => {
    it("should resolve with sink when creation succeeds", async () => {
      const sink = {
        name: "firebase-telemetry-routing",
        destination: "dest",
        filter: "filter",
      };
      nock(cloudloggingOrigin()).post("/v2/projects/project/sinks", sink).reply(200, sink);

      await expect(
        cloudlogging.createOrUpdateLogSink(
          "project",
          "firebase-telemetry-routing",
          "dest",
          "filter",
        ),
      ).to.eventually.deep.equal(sink);
    });

    it("should fall back to put when creation returns 409", async () => {
      const sink = {
        name: "firebase-telemetry-routing",
        destination: "dest",
        filter: "filter",
      };
      nock(cloudloggingOrigin())
        .post("/v2/projects/project/sinks", sink)
        .reply(409, { error: { status: "ALREADY_EXISTS" } });
      nock(cloudloggingOrigin())
        .put("/v2/projects/project/sinks/firebase-telemetry-routing", sink)
        .reply(200, sink);

      await expect(
        cloudlogging.createOrUpdateLogSink(
          "project",
          "firebase-telemetry-routing",
          "dest",
          "filter",
        ),
      ).to.eventually.deep.equal(sink);
    });
  });
});
