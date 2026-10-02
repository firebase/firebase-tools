import * as sinon from "sinon";
import { expect } from "chai";
import { command as enableCommand } from "./crashlytics-heapdumps-enable";
import { command as disableCommand } from "./crashlytics-heapdumps-disable";
import { command as statusCommand } from "./crashlytics-heapdumps-status";
import * as profilingManager from "../crashlytics/profilingManager";
import * as cloudbilling from "../gcp/cloudbilling";
import * as requireAuthModule from "../requireAuth";
import * as promptModule from "../prompt";
import { FirebaseError } from "../error";

describe("crashlytics:heapdumps commands", () => {
  const projectId = "test-project";
  const projectNumber = "1234567890";
  const hashedAppId = "abcdef123456";
  const appId = `1:${projectNumber}:android:${hashedAppId}`;
  const bucketName = `firebasecrashlytics-heap-dumps-${hashedAppId}`;

  beforeEach(() => {
    sinon.stub(requireAuthModule, "requireAuth").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("crashlytics:heapdumps:enable", () => {
    let checkBillingStub: sinon.SinonStub;
    let ensureBucketStub: sinon.SinonStub;
    let ensureP4saStub: sinon.SinonStub;
    let updateConfigStub: sinon.SinonStub;
    let confirmStub: sinon.SinonStub;

    beforeEach(() => {
      checkBillingStub = sinon.stub(cloudbilling, "checkBillingEnabled").resolves(true);
      ensureBucketStub = sinon
        .stub(profilingManager, "ensureHeapDumpStorageBucket")
        .resolves(bucketName);
      ensureP4saStub = sinon.stub(profilingManager, "ensureHeapDumpP4saRole").resolves();
      updateConfigStub = sinon.stub(profilingManager, "updateProfilingManagerConfig").resolves();
      confirmStub = sinon.stub(promptModule, "confirm").resolves(true);
    });

    it("should fail if billing is not enabled", async () => {
      checkBillingStub.resolves(false);

      await expect(
        enableCommand.runner()({
          project: projectId,
          app: appId,
          force: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "does not have billing enabled");

      expect(ensureBucketStub).to.not.have.been.called;
      expect(updateConfigStub).to.not.have.been.called;
    });

    it("should cancel if user denies confirmation", async () => {
      confirmStub.resolves(false);

      const result = await enableCommand.runner()({
        project: projectId,
        app: appId,
      });

      expect(result).to.be.undefined;
      expect(ensureBucketStub).to.not.have.been.called;
      expect(updateConfigStub).to.not.have.been.called;
    });

    it("should successfully provision bucket, grant P4SA role, and enable collection", async () => {
      const result = await enableCommand.runner()({
        project: projectId,
        app: appId,
        location: "us-central1",
        force: true,
      });

      expect(result).to.deep.equal({
        appId,
        bucketName,
        heapDumpCollectionEnabled: true,
      });

      expect(checkBillingStub).to.have.been.calledWith(projectId);
      expect(ensureBucketStub).to.have.been.calledWith(projectId, appId, "us-central1");
      expect(ensureP4saStub).to.have.been.calledWith(projectId, projectNumber);
      expect(updateConfigStub).to.have.been.calledWith(appId, {
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });
    });

    it("should throw if an invalid app ID is supplied", async () => {
      await expect(
        enableCommand.runner()({
          project: projectId,
          app: `1:${projectNumber}:ios:${hashedAppId}`,
          force: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Heap dump collection is only supported for Android apps.",
      );
    });
  });

  describe("crashlytics:heapdumps:disable", () => {
    let getConfigStub: sinon.SinonStub;
    let updateConfigStub: sinon.SinonStub;
    let confirmStub: sinon.SinonStub;

    beforeEach(() => {
      getConfigStub = sinon.stub(profilingManager, "getProfilingManagerConfig").resolves({
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });
      updateConfigStub = sinon.stub(profilingManager, "updateProfilingManagerConfig").resolves();
      confirmStub = sinon.stub(promptModule, "confirm").resolves(true);
    });

    it("should cancel if user denies confirmation", async () => {
      confirmStub.resolves(false);

      const result = await disableCommand.runner()({
        project: projectId,
        app: appId,
      });

      expect(result).to.be.undefined;
      expect(updateConfigStub).to.not.have.been.called;
    });

    it("should successfully disable collection", async () => {
      const result = await disableCommand.runner()({
        project: projectId,
        app: appId,
        force: true,
      });

      expect(result).to.deep.equal({
        appId,
        heapDumpCollectionEnabled: false,
      });

      expect(getConfigStub).to.have.been.calledWith(appId);
      expect(updateConfigStub).to.have.been.calledWith(appId, {
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: false,
      });
    });
  });

  describe("crashlytics:heapdumps:status", () => {
    it("should return the status and configuration", async () => {
      sinon.stub(profilingManager, "getProfilingManagerConfig").resolves({
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });

      const result = await statusCommand.runner()({
        project: projectId,
        app: appId,
      });

      expect(result).to.deep.equal({
        appId,
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });
    });
  });
});
