import { expect } from "chai";
import * as sinon from "sinon";

import * as args from "./args";
import * as backend from "./backend";
import * as deploy from "./deploy";
import * as gcs from "../../gcp/storage";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";
import * as experiments from "../../experiments";

describe("deploy", () => {
  const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv2",
    id: "id",
    region: "region",
    project: "project",
    entryPoint: "entry",
    runtime: "nodejs16",
  };

  const ENDPOINT: backend.Endpoint = {
    ...ENDPOINT_BASE,
    httpsTrigger: {},
  };

  const CONTEXT: args.Context = {
    projectId: "project",
  };

  describe("shouldUploadBeSkipped", () => {
    let endpoint1InWantBackend: backend.Endpoint;
    let endpoint2InWantBackend: backend.Endpoint;
    let endpoint1InHaveBackend: backend.Endpoint;
    let endpoint2InHaveBackend: backend.Endpoint;

    let wantBackend: backend.Backend;
    let haveBackend: backend.Backend;

    beforeEach(() => {
      endpoint1InWantBackend = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint2InWantBackend = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint1InHaveBackend = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv2",
        codebase: "backend2",
      };
      endpoint2InHaveBackend = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv2",
        codebase: "backend2",
      };

      wantBackend = backend.of(endpoint1InWantBackend, endpoint2InWantBackend);
      haveBackend = backend.of(endpoint1InHaveBackend, endpoint2InHaveBackend);
    });

    it("should skip if all endpoints are identical", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;
      endpoint1InHaveBackend.state = "ACTIVE";
      endpoint2InHaveBackend.state = "ACTIVE";

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.true;
    });

    it("should not skip if hashes don't match", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = "No_match";

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.false;
    });

    it("should not skip if haveBackend is missing", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;

      wantBackend = backend.of(endpoint1InWantBackend, endpoint2InWantBackend);
      haveBackend = backend.of(endpoint1InHaveBackend);

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.false;
    });

    it("should not skip if wantBackend is missing", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;

      wantBackend = backend.of(endpoint1InWantBackend);
      haveBackend = backend.of(endpoint1InHaveBackend, endpoint2InHaveBackend);

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.false;
    });

    it("should not skip if endpoint filter is specified", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;

      // Execute
      const result = deploy.shouldUploadBeSkipped(
        { ...CONTEXT, filters: [{ idChunks: ["foobar"] }] },
        wantBackend,
        haveBackend,
      );

      // Expect
      expect(result).to.be.false;
    });

    it("should not skip if state is not ACTIVE", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;
      endpoint1InHaveBackend.state = "ACTIVE";
      endpoint2InHaveBackend.state = "FAILED";

      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      expect(result).to.be.false;
    });

    it("should skip if all endpoints are identical and ACTIVE", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;
      endpoint1InHaveBackend.state = "ACTIVE";
      endpoint2InHaveBackend.state = "ACTIVE";

      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      expect(result).to.be.true;
    });
  });

  describe("uploadSourceV2", () => {
    let gcsUploadStub: sinon.SinonStub;
    let gcsUpsertBucketStub: sinon.SinonStub;
    let gcfv2GenerateUploadUrlStub: sinon.SinonStub;
    let createReadStreamStub: sinon.SinonStub;
    let experimentEnabled: boolean;

    const SOURCE: args.Source = {
      functionsSourceV2: "source.zip",
      functionsSourceV2Hash: "source-hash",
    };

    before(() => {
      experimentEnabled = experiments.isEnabled("runfunctions");
    });
    after(() => experiments.setEnabled("runfunctions", experimentEnabled));

    beforeEach(() => {
      gcsUploadStub = sinon.stub(gcs, "upload").resolves({ generation: "1" });
      gcsUpsertBucketStub = sinon.stub(gcs, "upsertBucket");
      gcfv2GenerateUploadUrlStub = sinon.stub(gcfv2, "generateUploadUrl").resolves({
        uploadUrl: "https://storage.googleapis.com/upload/url",
        storageSource: {
          bucket: "gcf-sources-123-us-central1",
          object: "source-hash.zip",
        },
      });
      createReadStreamStub = sinon.stub(deploy, "createReadStream").returns("stream" as any);
    });

    afterEach(() => {
      sinon.restore();
    });

    describe("with runfunctions experiment enabled", () => {
      const PROJECT_NUMBER = "123456";
      const BUCKET_NAME = `firebase-functions-src-${PROJECT_NUMBER}`;

      before(() => experiments.setEnabled("runfunctions", true));

      it("should call gcs.upsertBucket and gcs.upload for gcfv2 functions", async () => {
        const wantBackend = backend.of({ ...ENDPOINT, platform: "gcfv2" });
        gcsUpsertBucketStub.resolves(BUCKET_NAME);

        await deploy.uploadSourceV2("project", PROJECT_NUMBER, SOURCE, wantBackend);

        expect(gcsUpsertBucketStub).to.be.calledOnceWith({
          product: "functions",
          projectId: "project",
          createMessage: `Creating Cloud Storage bucket in region to store Functions source code uploads at ${BUCKET_NAME}...`,
          req: {
            baseName: BUCKET_NAME,
            location: "region",
            purposeLabel: "functions-source-region",
            lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 1 } }] },
          },
        });
        expect(createReadStreamStub).to.be.calledOnceWith("source.zip");
        expect(gcsUploadStub).to.be.calledOnceWith(
          { file: "source.zip", stream: "stream" },
          `${BUCKET_NAME}/source-hash.zip`,
          undefined,
          true,
        );
        expect(gcfv2GenerateUploadUrlStub).not.to.be.called;
      });

      it("should call gcs.upsertBucket and gcs.upload for run functions", async () => {
        const wantBackend = backend.of({ ...ENDPOINT, platform: "run" });
        gcsUpsertBucketStub.resolves(BUCKET_NAME);

        await deploy.uploadSourceV2("project", PROJECT_NUMBER, SOURCE, wantBackend);

        expect(gcsUpsertBucketStub).to.be.calledOnceWith({
          product: "functions",
          projectId: "project",
          createMessage: `Creating Cloud Storage bucket in region to store Functions source code uploads at ${BUCKET_NAME}...`,
          req: {
            baseName: BUCKET_NAME,
            location: "region",
            purposeLabel: "functions-source-region",
            lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 1 } }] },
          },
        });
        expect(createReadStreamStub).to.be.calledOnceWith("source.zip");
        expect(gcsUploadStub).to.be.calledOnceWith(
          { file: "source.zip", stream: "stream" },
          `${BUCKET_NAME}/source-hash.zip`,
          undefined,
          true,
        );
        expect(gcfv2GenerateUploadUrlStub).not.to.be.called;
      });
    });

    context("with runfunctions experiment disabled", () => {
      before(() => experiments.setEnabled("runfunctions", false));

      it("should call gcfv2.generateUploadUrl and gcs.upload", async () => {
        const wantBackend = backend.of({ ...ENDPOINT, platform: "gcfv2" });

        await deploy.uploadSourceV2("project", "123456", SOURCE, wantBackend);

        expect(gcfv2GenerateUploadUrlStub).to.be.calledOnceWith("project", "region");
        expect(createReadStreamStub).to.be.calledOnceWith("source.zip");
        expect(gcsUploadStub).to.be.calledOnceWith(
          { file: "source.zip", stream: "stream" },
          "https://storage.googleapis.com/upload/url",
          undefined,
          true,
        );
        expect(gcsUpsertBucketStub).not.to.be.called;
      });
    });
  });
});
