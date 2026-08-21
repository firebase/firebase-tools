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

  describe("getLogViewIamPolicy", () => {
    it("should resolve with policy on success", async () => {
      const policy = {
        bindings: [{ role: "roles/logging.viewAccessor", members: ["projectViewer:project"] }],
        etag: "etag123",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:getIamPolicy",
        )
        .reply(200, policy);

      await expect(
        cloudlogging.getLogViewIamPolicy("project", "firebase-telemetry", "_AllLogs", "global"),
      ).to.eventually.deep.equal(policy);
    });

    it("should reject if API call fails", async () => {
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:getIamPolicy",
        )
        .reply(403, { error: "forbidden" });

      const promise = cloudlogging.getLogViewIamPolicy(
        "project",
        "firebase-telemetry",
        "_AllLogs",
        "global",
      );
      await expect(promise).to.be.rejectedWith(
        FirebaseError,
        "Failed to get IAM policy for log view _AllLogs on bucket firebase-telemetry (status 403):",
      );
      await expect(promise).to.be.rejected.and.eventually.have.property("status", 403);
    });
  });

  describe("setLogViewIamPolicy", () => {
    it("should resolve with policy on success", async () => {
      const policy = {
        bindings: [{ role: "roles/logging.viewAccessor", members: ["projectViewer:project"] }],
        etag: "etag123",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:setIamPolicy",
          { policy },
        )
        .reply(200, policy);

      await expect(
        cloudlogging.setLogViewIamPolicy(
          "project",
          "firebase-telemetry",
          "_AllLogs",
          policy,
          "global",
        ),
      ).to.eventually.deep.equal(policy);
    });

    it("should reject if API call fails", async () => {
      const policy = {
        bindings: [],
        etag: "etag123",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:setIamPolicy",
          { policy },
        )
        .reply(500, { error: "internal error" });

      const promise = cloudlogging.setLogViewIamPolicy(
        "project",
        "firebase-telemetry",
        "_AllLogs",
        policy,
        "global",
      );
      await expect(promise).to.be.rejectedWith(
        FirebaseError,
        "Failed to set IAM policy for log view _AllLogs on bucket firebase-telemetry (status 500):",
      );
      await expect(promise).to.be.rejected.and.eventually.have.property("status", 500);
    });
  });

  describe("grantLogViewAccess", () => {
    it("should add binding when role does not exist in policy", async () => {
      const existingPolicy = {
        bindings: [{ role: "roles/logging.viewer", members: ["user:admin@example.com"] }],
        etag: "etag123",
        version: 3,
      };
      const updatedPolicy = {
        bindings: [
          { role: "roles/logging.viewer", members: ["user:admin@example.com"] },
          { role: "roles/logging.viewAccessor", members: ["projectViewer:project"] },
        ],
        etag: "etag123",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:getIamPolicy",
        )
        .reply(200, existingPolicy);
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:setIamPolicy",
          { policy: updatedPolicy },
        )
        .reply(200, updatedPolicy);

      const result = await cloudlogging.grantLogViewAccess(
        "project",
        "firebase-telemetry",
        "_AllLogs",
        "projectViewer:project",
        "roles/logging.viewAccessor",
        "global",
      );
      expect(result).to.deep.equal(updatedPolicy);
    });

    it("should add member to existing role binding", async () => {
      const existingPolicy = {
        bindings: [{ role: "roles/logging.viewAccessor", members: ["user:existing@example.com"] }],
        etag: "etag123",
        version: 3,
      };
      const updatedPolicy = {
        bindings: [
          {
            role: "roles/logging.viewAccessor",
            members: ["user:existing@example.com", "projectViewer:project"],
          },
        ],
        etag: "etag123",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:getIamPolicy",
        )
        .reply(200, existingPolicy);
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:setIamPolicy",
          { policy: updatedPolicy },
        )
        .reply(200, updatedPolicy);

      const result = await cloudlogging.grantLogViewAccess(
        "project",
        "firebase-telemetry",
        "_AllLogs",
        "projectViewer:project",
        "roles/logging.viewAccessor",
        "global",
      );
      expect(result).to.deep.equal(updatedPolicy);
    });

    it("should return existing policy without calling setIamPolicy if member already has role", async () => {
      const existingPolicy = {
        bindings: [{ role: "roles/logging.viewAccessor", members: ["projectViewer:project"] }],
        etag: "etag123",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:getIamPolicy",
        )
        .reply(200, existingPolicy);

      const result = await cloudlogging.grantLogViewAccess(
        "project",
        "firebase-telemetry",
        "_AllLogs",
        "projectViewer:project",
        "roles/logging.viewAccessor",
        "global",
      );
      expect(result).to.deep.equal(existingPolicy);
    });

    it("should create new policy if getLogViewIamPolicy returns 404", async () => {
      const expectedPolicy = {
        bindings: [{ role: "roles/logging.viewAccessor", members: ["projectViewer:project"] }],
        etag: "",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:getIamPolicy",
        )
        .reply(404, { error: "not found" });
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:setIamPolicy",
          { policy: expectedPolicy },
        )
        .reply(200, expectedPolicy);

      const result = await cloudlogging.grantLogViewAccess(
        "project",
        "firebase-telemetry",
        "_AllLogs",
        "projectViewer:project",
        "roles/logging.viewAccessor",
        "global",
      );
      expect(result).to.deep.equal(expectedPolicy);
    });

    it("should add multiple members to the role binding", async () => {
      const existingPolicy = {
        bindings: [],
        etag: "etag123",
        version: 3,
      };
      const updatedPolicy = {
        bindings: [
          {
            role: "roles/logging.viewAccessor",
            members: ["projectViewer:project", "projectEditor:project", "projectOwner:project"],
          },
        ],
        etag: "etag123",
        version: 3,
      };
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:getIamPolicy",
        )
        .reply(200, existingPolicy);
      nock(cloudloggingOrigin())
        .post(
          "/v2/projects/project/locations/global/buckets/firebase-telemetry/views/_AllLogs:setIamPolicy",
          { policy: updatedPolicy },
        )
        .reply(200, updatedPolicy);

      const result = await cloudlogging.grantLogViewAccess(
        "project",
        "firebase-telemetry",
        "_AllLogs",
        ["projectViewer:project", "projectEditor:project", "projectOwner:project"],
        "roles/logging.viewAccessor",
        "global",
      );
      expect(result).to.deep.equal(updatedPolicy);
    });
  });
});
