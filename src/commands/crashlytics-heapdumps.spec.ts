import * as sinon from "sinon";
import { expect } from "chai";
import * as program from "commander";
import { CLIClient } from "../command";
import { load } from "./index";
import { command as enableCommand } from "./crashlytics-heapdumps-enable";
import { command as disableCommand } from "./crashlytics-heapdumps-disable";
import { command as statusCommand } from "./crashlytics-heapdumps-status";
import * as profilingManager from "../crashlytics/profilingManager";
import * as cloudbilling from "../gcp/cloudbilling";
import * as promptModule from "../prompt";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";

describe("crashlytics:heapdumps commands", () => {
  const projectId = "test-project";
  const projectNumber = "1234567890";
  const hashedAppId = "abcdef123456";
  const appId = `1:${projectNumber}:android:${hashedAppId}`;
  const bucketName = `firebasecrashlytics-heap-dumps-${hashedAppId}`;

  const originalEnableBefores = [...(enableCommand["befores"] || [])];
  const originalDisableBefores = [...(disableCommand["befores"] || [])];
  const originalStatusBefores = [...(statusCommand["befores"] || [])];

  beforeEach(() => {
    enableCommand["befores"] = [];
    disableCommand["befores"] = [];
    statusCommand["befores"] = [];
  });

  afterEach(() => {
    enableCommand["befores"] = [...originalEnableBefores];
    disableCommand["befores"] = [...originalDisableBefores];
    statusCommand["befores"] = [...originalStatusBefores];
    sinon.restore();
  });

  it("should require authentication on all heapdumps commands", () => {
    expect(originalEnableBefores).to.deep.equal([{ fn: requireAuth, args: [] }]);
    expect(originalDisableBefores).to.deep.equal([{ fn: requireAuth, args: [] }]);
    expect(originalStatusBefores).to.deep.equal([{ fn: requireAuth, args: [] }]);
  });

  describe("crashlytics:heapdumps:enable", () => {
    let checkBillingStub: sinon.SinonStub;
    let enableCollectionStub: sinon.SinonStub;
    let confirmStub: sinon.SinonStub;

    beforeEach(() => {
      checkBillingStub = sinon.stub(cloudbilling, "checkBillingEnabled").resolves(true);
      enableCollectionStub = sinon
        .stub(profilingManager, "enableHeapDumpCollection")
        .resolves(bucketName);
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
      ).to.be.rejectedWith(FirebaseError, "is not on the Blaze (pay-as-you-go) plan");

      expect(enableCollectionStub).to.not.have.been.called;
    });

    it("should cancel if user denies confirmation", async () => {
      confirmStub.resolves(false);

      const result: unknown = await enableCommand.runner()({
        project: projectId,
        app: appId,
      });

      expect(result).to.be.undefined;
      expect(enableCollectionStub).to.not.have.been.called;
    });

    it("should successfully provision bucket, grant P4SA role, and enable collection", async () => {
      const result: unknown = await enableCommand.runner()({
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
      expect(enableCollectionStub).to.have.been.calledOnceWith(projectId, appId, "us-central1");
    });

    it("should default location to DEFAULT_BUCKET_LOCATION when location option is empty", async () => {
      await enableCommand.runner()({
        project: projectId,
        app: appId,
        location: "",
        force: true,
      });

      expect(enableCollectionStub).to.have.been.calledOnceWith(
        projectId,
        appId,
        profilingManager.DEFAULT_BUCKET_LOCATION,
      );
    });

    it("should rethrow error when provisioning or enabling collection fails", async () => {
      const boom = new FirebaseError("Storage failure");
      enableCollectionStub.rejects(boom);

      await expect(
        enableCommand.runner()({
          project: projectId,
          app: appId,
          force: true,
        }),
      ).to.be.rejectedWith(boom);
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
    let disableCollectionStub: sinon.SinonStub;

    beforeEach(() => {
      disableCollectionStub = sinon.stub(profilingManager, "disableHeapDumpCollection").resolves();
    });

    it("should successfully disable collection", async () => {
      const result: unknown = await disableCommand.runner()({
        project: projectId,
        app: appId,
      });

      expect(result).to.deep.equal({
        appId,
        heapDumpCollectionEnabled: false,
      });

      expect(disableCollectionStub).to.have.been.calledOnceWith(appId);
    });

    it("should rethrow error when disabling collection fails", async () => {
      const boom = new FirebaseError("Update failed");
      disableCollectionStub.rejects(boom);

      await expect(
        disableCommand.runner()({
          project: projectId,
          app: appId,
        }),
      ).to.be.rejectedWith(boom);
    });
  });

  describe("crashlytics:heapdumps:status", () => {
    it("should return the status and configuration when enabled", async () => {
      sinon.stub(profilingManager, "getProfilingManagerConfig").resolves({
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });

      const result: unknown = await statusCommand.runner()({
        project: projectId,
        app: appId,
      });

      expect(result).to.deep.equal({
        appId,
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });
    });

    it("should return the status and configuration when disabled with no bucket", async () => {
      sinon.stub(profilingManager, "getProfilingManagerConfig").resolves({
        gcsBucket: "",
        heapDumpCollectionEnabled: false,
      });

      const result: unknown = await statusCommand.runner()({
        project: projectId,
        app: appId,
      });

      expect(result).to.deep.equal({
        appId,
        gcsBucket: "",
        heapDumpCollectionEnabled: false,
      });
    });

    it("should register and run crashlytics.heapdumps commands via command loader", async () => {
      sinon.stub(profilingManager, "getProfilingManagerConfig").resolves({
        gcsBucket: bucketName,
        heapDumpCollectionEnabled: true,
      });

      const client: CLIClient = {
        cli: program,
        errorOut: sinon.stub(),
      };
      load(client);
      const heapdumps = (
        client.crashlytics as {
          heapdumps: {
            status: ((options: Record<string, unknown>) => Promise<unknown>) & { load: () => void };
          };
        }
      ).heapdumps;

      heapdumps.status.load();
      const result: unknown = await heapdumps.status({
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
