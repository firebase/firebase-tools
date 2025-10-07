import { expect } from "chai";
import * as sinon from "sinon";

import * as storage from "./storage";
import * as utils from "../utils";
import * as projects from "../management/projects";
import { FirebaseError } from "../error";

describe("storage", () => {
  describe("upsertBucket", () => {
    let getBucketStub: sinon.SinonStub;
    let createBucketStub: sinon.SinonStub;
    let getProjectStub: sinon.SinonStub;
    let logLabeledBulletStub: sinon.SinonStub;
    let logLabeledWarningStub: sinon.SinonStub;

    beforeEach(() => {
      getBucketStub = sinon.stub(storage, "getBucket");
      createBucketStub = sinon.stub(storage, "createBucket");
      getProjectStub = sinon.stub(projects, "getProject");
      logLabeledBulletStub = sinon.stub(utils, "logLabeledBullet");
      logLabeledWarningStub = sinon.stub(utils, "logLabeledWarning");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should not call createBucket if the bucket already exists", async () => {
      getBucketStub.resolves({projectNumber: 123456});
      getProjectStub.resolves({projectNumber:123456});

      await storage.upsertBucket({
        product: "test",
        createMessage: "Creating bucket",
        projectId: "test-project",
        req: { name: "test-bucket", location: "us-central1", lifecycle: { rule: [] } },
      });

      expect(getBucketStub).to.be.calledOnceWith("test-bucket");
      expect(getProjectStub).to.be.calledOnceWith("test-project");
      expect(createBucketStub).to.not.be.called;
      expect(logLabeledBulletStub).to.not.be.called;
    });

    it("should call createBucket if the bucket does not exist (404)", async () => {
      const error = new FirebaseError("Not found", { original: { status: 404 } as any });
      getBucketStub.rejects(error);
      createBucketStub.resolves();

      await storage.upsertBucket({
        product: "test",
        createMessage: "Creating bucket",
        projectId: "test-project",
        req: { name: "test-bucket", location: "us-central1", lifecycle: { rule: [] } },
      });

      expect(getBucketStub).to.be.calledOnceWith("test-bucket");
      expect(createBucketStub).to.be.calledOnceWith(
        "test-project",
        {
          name: "test-bucket",
          location: "us-central1",
          lifecycle: { rule: [] },
        },
        true,
      );
      expect(logLabeledBulletStub).to.be.calledOnceWith("test", "Creating bucket");
    });

    it("should call createBucket if the bucket does not exist (403)", async () => {
      const error = new FirebaseError("Unauthenticated", { original: { status: 403 } as any });
      getBucketStub.rejects(error);
      createBucketStub.resolves();

      await storage.upsertBucket({
        product: "test",
        createMessage: "Creating bucket",
        projectId: "test-project",
        req: { name: "test-bucket", location: "us-central1", lifecycle: { rule: [] } },
      });

      expect(getBucketStub).to.be.calledOnceWith("test-bucket");
      expect(createBucketStub).to.be.calledOnceWith(
        "test-project",
        {
          name: "test-bucket",
          location: "us-central1",
          lifecycle: { rule: [] },
        },
        true,
      );
      expect(logLabeledBulletStub).to.be.calledOnceWith("test", "Creating bucket");
    });

    it("should explain IAM errors", async () => {
      const notFound = new FirebaseError("Bucket not found", { original: { status: 404 } as any });
      const permissionDenied = new FirebaseError("Permission denied", {
        original: { status: 403 } as any,
      });
      getBucketStub.rejects(notFound);
      createBucketStub.rejects(permissionDenied);

      await expect(
        storage.upsertBucket({
          product: "test",
          createMessage: "Creating bucket",
          projectId: "test-project",
          req: { name: "test-bucket", location: "us-central1", lifecycle: { rule: [] } },
        }),
      ).to.be.rejected;

      expect(logLabeledWarningStub).to.be.calledWithMatch(
        "test",
        /Failed to create Cloud Storage bucket because user does not have sufficient permissions/,
      );
    });

    it("should forward unexpected errors", async () => {
      const error = new FirebaseError("Unexpected error", { original: { status: 500 } as any });
      getBucketStub.rejects(error);

      await expect(
        storage.upsertBucket({
          product: "test",
          createMessage: "Creating bucket",
          projectId: "test-project",
          req: { name: "test-bucket", location: "us-central1", lifecycle: { rule: [] } },
        }),
      ).to.be.rejectedWith("Unexpected error");

      expect(getBucketStub).to.be.calledOnceWith("test-bucket");
      expect(createBucketStub).to.not.be.called;
      expect(logLabeledBulletStub).to.not.be.called;
    });
  });
});
