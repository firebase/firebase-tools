import { expect } from "chai";
import * as sinon from "sinon";

import * as storage from "./storage";
import * as utils from "../utils";
import { FirebaseError } from "../error";

describe("storage", () => {
  describe("upsertBucket", () => {
    let listBucketsStub: sinon.SinonStub;
    let createBucketStub: sinon.SinonStub;
    let patchBucketStub: sinon.SinonStub;
    let logLabeledBulletStub: sinon.SinonStub;
    let logLabeledWarningStub: sinon.SinonStub;
    let randomStringStub: sinon.SinonStub;

    const PROJECT_ID = "test-project";
    const BUCKET_LIFECYCLE = { rule: [{ action: { type: "Delete" }, condition: { age: 30 } }] };
    const BASE_BUCKET_NAME = "test-bucket";
    const PURPOSE_LABEL = "test-purpose";

    beforeEach(() => {
      listBucketsStub = sinon.stub(storage, "listBuckets");
      createBucketStub = sinon.stub(storage, "createBucket");
      patchBucketStub = sinon.stub(storage, "patchBucket");
      logLabeledBulletStub = sinon.stub(utils, "logLabeledBullet");
      logLabeledWarningStub = sinon.stub(utils, "logLabeledWarning");
      randomStringStub = sinon.stub(storage, "randomString").returns("abcdef");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should return existing bucket name if a bucket with the purpose label is found", async () => {
      const bucketName = "existing-bucket";
      listBucketsStub.resolves([
        { name: bucketName, labels: { [PURPOSE_LABEL]: "true" } },
        { name: "another-bucket", labels: {} },
      ] as any);

      const result = await storage.upsertBucket({
        product: "test",
        createMessage: "Creating bucket",
        projectId: PROJECT_ID,
        req: {
          baseName: BASE_BUCKET_NAME,
          location: "us-central1",
          purposeLabel: PURPOSE_LABEL,
          lifecycle: BUCKET_LIFECYCLE,
        },
      });

      expect(result).to.equal(bucketName);
      expect(listBucketsStub).to.be.calledOnceWith(PROJECT_ID);
      expect(createBucketStub).to.not.be.called;
    });

    it("should patch an existing bucket if it does not have a purpose label", async () => {
      const bucketName = "existing-unmanaged-bucket";
      listBucketsStub.resolves([{ name: bucketName, labels: {} }] as any);

      const result = await storage.upsertBucket({
        product: "test",
        createMessage: "Creating bucket",
        projectId: PROJECT_ID,
        req: {
          baseName: bucketName,
          location: "us-central1",
          purposeLabel: PURPOSE_LABEL,
          lifecycle: BUCKET_LIFECYCLE,
        },
      });

      expect(result).to.equal(bucketName);
      expect(listBucketsStub).to.be.calledOnceWith(PROJECT_ID);
      expect(patchBucketStub).to.be.calledOnceWith(bucketName, {
        labels: { [PURPOSE_LABEL]: "true" },
      });
      expect(createBucketStub).to.not.be.called;
    });

    it("should create a new bucket if no bucket with the purpose label is found", async () => {
      listBucketsStub.resolves([{ name: "another-bucket", labels: {} }] as any);
      createBucketStub.resolves({ name: BASE_BUCKET_NAME } as any);

      const result = await storage.upsertBucket({
        product: "test",
        createMessage: "Creating bucket",
        projectId: PROJECT_ID,
        req: {
          baseName: BASE_BUCKET_NAME,
          location: "us-central1",
          purposeLabel: PURPOSE_LABEL,
          lifecycle: BUCKET_LIFECYCLE,
        },
      });

      expect(result).to.equal(BASE_BUCKET_NAME);
      expect(listBucketsStub).to.be.calledOnceWith(PROJECT_ID);
      expect(createBucketStub).to.be.calledOnceWith(
        PROJECT_ID,
        {
          name: BASE_BUCKET_NAME,
          location: "us-central1",
          lifecycle: BUCKET_LIFECYCLE,
          labels: { [PURPOSE_LABEL]: "true" },
        },
        true,
      );
      expect(logLabeledBulletStub).to.be.calledOnce;
    });

    it("should handle listBuckets failure", async () => {
      const error = new FirebaseError("Failed to list buckets");
      listBucketsStub.rejects(error);

      await expect(
        storage.upsertBucket({
          product: "test",
          createMessage: "Creating bucket",
          projectId: PROJECT_ID,
          req: {
            baseName: BASE_BUCKET_NAME,
            location: "us-central1",
            purposeLabel: PURPOSE_LABEL,
            lifecycle: BUCKET_LIFECYCLE,
          },
        }),
      ).to.be.rejectedWith(error);

      expect(listBucketsStub).to.be.calledOnceWith(PROJECT_ID);
      expect(createBucketStub).to.not.be.called;
    });

    it("should retry with a new name on createBucket conflict", async () => {
      const conflictError = new FirebaseError("Conflict", { original: { status: 409 } as any });
      const randomSuffix = "abcdef";
      const newBucketName = `${BASE_BUCKET_NAME}-${randomSuffix}`;

      listBucketsStub.resolves([]);
      createBucketStub.onFirstCall().rejects(conflictError);
      createBucketStub.onSecondCall().resolves({ name: newBucketName } as any);

      const result = await storage.upsertBucket({
        product: "test",
        createMessage: "Creating bucket",
        projectId: PROJECT_ID,
        req: {
          baseName: BASE_BUCKET_NAME,
          location: "us-central1",
          purposeLabel: PURPOSE_LABEL,
          lifecycle: BUCKET_LIFECYCLE,
        },
      });

      expect(result).to.equal(newBucketName);
      expect(createBucketStub).to.be.calledTwice;
      expect(createBucketStub.firstCall.args[1].name).to.equal(BASE_BUCKET_NAME);
      expect(createBucketStub.secondCall.args[1].name).to.equal(newBucketName);
      expect(randomStringStub).to.be.calledOnceWith(6);
    });

    it("should error out after 5 createBucket conflicts", async () => {
      const conflictError = new FirebaseError("Conflict", { original: { status: 409 } as any });
      listBucketsStub.resolves([]);
      createBucketStub.rejects(conflictError);

      await expect(
        storage.upsertBucket({
          product: "test",
          createMessage: "Creating bucket",
          projectId: PROJECT_ID,
          req: {
            baseName: BASE_BUCKET_NAME,
            location: "us-central1",
            purposeLabel: PURPOSE_LABEL,
            lifecycle: BUCKET_LIFECYCLE,
          },
        }),
      ).to.be.rejectedWith("Failed to create a unique Cloud Storage bucket name after 5 attempts.");

      expect(createBucketStub.callCount).to.equal(5);
    });

    it("should handle permission errors on createBucket", async () => {
      const permError = new FirebaseError("Permission denied", {
        original: { status: 403 } as any,
      });
      listBucketsStub.resolves([]);
      createBucketStub.rejects(permError);

      await expect(
        storage.upsertBucket({
          product: "test",
          createMessage: "Creating bucket",
          projectId: PROJECT_ID,
          req: {
            baseName: BASE_BUCKET_NAME,
            location: "us-central1",
            purposeLabel: PURPOSE_LABEL,
            lifecycle: BUCKET_LIFECYCLE,
          },
        }),
      ).to.be.rejectedWith(permError);

      expect(logLabeledWarningStub).to.be.calledOnce;
      expect(createBucketStub).to.be.calledOnce;
    });

    it("should forward unexpected errors from createBucket", async () => {
      const unexpectedError = new FirebaseError("Unexpected error", {
        original: { status: 500 } as any,
      });
      listBucketsStub.resolves([]);
      createBucketStub.rejects(unexpectedError);

      await expect(
        storage.upsertBucket({
          product: "test",
          createMessage: "Creating bucket",
          projectId: PROJECT_ID,
          req: {
            baseName: BASE_BUCKET_NAME,
            location: "us-central1",
            purposeLabel: PURPOSE_LABEL,
            lifecycle: BUCKET_LIFECYCLE,
          },
        }),
      ).to.be.rejectedWith(unexpectedError);

      expect(logLabeledWarningStub).to.not.be.called;
      expect(createBucketStub).to.be.calledOnce;
    });
  });
});
