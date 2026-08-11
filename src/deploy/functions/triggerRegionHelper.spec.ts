import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import * as firestore from "../../gcp/firestore";
import * as database from "../../management/database";
import * as utils from "../../utils";
import * as triggerRegionHelper from "./triggerRegionHelper";
import * as storageService from "./services/storage";
import * as firestoreService from "./services/firestore";
import * as databaseService from "./services/database";

const SPEC = {
  region: "us-west1",
  project: "my-project",
  runtime: "nodejs14" as const,
};

describe("TriggerRegionHelper", () => {
  describe("ensureTriggerRegions", () => {
    let storageStub: sinon.SinonStub;
    let firestoreStub: sinon.SinonStub;
    let databaseStub: sinon.SinonStub;
    let logWarningSpy: sinon.SinonSpy;

    beforeEach(() => {
      storageService.clearCache();
      firestoreService.clearCache();
      databaseService.clearCache();
      storageStub = sinon.stub(storage, "getBucket").throws("unexpected call to storage.getBucket");
      firestoreStub = sinon
        .stub(firestore, "getDatabase")
        .throws("unexpected call to firestore.getDatabase");
      databaseStub = sinon
        .stub(database, "getDatabaseInstanceDetails")
        .throws("unexpected call to database.getDatabaseInstanceDetails");
      logWarningSpy = sinon.spy(utils, "logLabeledWarning");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
      delete process.env.FIREBASE_SUPPRESS_REGION_WARNING;
    });

    // --- V2 Tests ---

    it("should throw an error if we can't find the bucket region", async () => {
      const ep: backend.Endpoint = {
        id: "fn",
        entryPoint: "fnn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      await expect(triggerRegionHelper.ensureTriggerRegions(backend.of(ep))).to.be.rejectedWith(
        "Can't find the storage bucket region",
      );
    });

    it("should set trigger region from API", async () => {
      storageStub.resolves({ location: "US" });
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn));

      const want: backend.EventTrigger = {
        eventType: "google.cloud.storage.object.v1.finalized",
        eventFilters: { bucket: "my-bucket" },
        retry: false,
        region: "us",
      };
      expect(wantFn.eventTrigger).to.deep.eq(want);
    });

    it("should set trigger region from API then reject on invalid function region", async () => {
      storageStub.resolves({ location: "EUROPE-WEST1" });
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
        region: "us-west1",
      };

      await expect(triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn))).to.be.rejectedWith(
        "A function in region us-west1 cannot listen to a bucket in region europe-west1",
      );
    });

    it("should warn if a function region is us-central1 but the trigger is non-US", async () => {
      firestoreStub.resolves({ locationId: "europe-west1" });
      const ep: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: { database: "(default)" },
          retry: false,
          region: "europe-west1",
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));

      expect(logWarningSpy.calledOnce).to.be.true;
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "The following functions have triggers in different regions than they are located",
      );
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "- wantFn (us-central1, Trigger: europe-west1)",
      );
    });

    it("should warn on multiple transatlantic latency hops with a rolled-up log message", async () => {
      firestoreStub.withArgs(sinon.match.any, "(default)").resolves({ locationId: "europe-west1" });
      firestoreStub
        .withArgs(sinon.match.any, "my-secondary-db")
        .resolves({ locationId: "asia-northeast1" });
      const wantFn1: backend.Endpoint = {
        id: "wantFn1",
        entryPoint: "wantFn1",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: { database: "(default)" },
          retry: false,
          region: "europe-west1",
        },
        ...SPEC,
        region: "us-central1",
      };

      const wantFn2: backend.Endpoint = {
        id: "wantFn2",
        entryPoint: "wantFn2",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: { database: "my-secondary-db" },
          retry: false,
          region: "asia-northeast1",
        },
        ...SPEC,
        region: "us-central1",
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn1, wantFn2));

      expect(logWarningSpy.calledOnce).to.be.true;
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "- wantFn1 (us-central1, Trigger: europe-west1)",
      );
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "- wantFn2 (us-central1, Trigger: asia-northeast1)",
      );
    });

    it("should be able to suppress warnings with an environment flag for V2", async () => {
      firestoreStub.resolves({ locationId: "europe-west1" });
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: { database: "(default)" },
          retry: false,
          region: "europe-west1",
        },
        ...SPEC,
        region: "us-central1",
      };

      process.env.FIREBASE_SUPPRESS_REGION_WARNING = "true";

      await triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn));

      expect(logWarningSpy.called).to.be.false;
    });

    it("should not warn when regions match for V2", async () => {
      firestoreStub.resolves({ locationId: "us-central1" });
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: { database: "(default)" },
          retry: false,
          region: "us-central1",
        },
        ...SPEC,
        region: "us-central1",
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn));

      expect(logWarningSpy.called).to.be.false;
    });

    it("should not warn when US function uses nam5 multi-region trigger for V2", async () => {
      firestoreStub.resolves({ locationId: "nam5" });
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: { database: "(default)" },
          retry: false,
          region: "nam5",
        },
        ...SPEC,
        region: "us-central1",
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn));

      expect(logWarningSpy.called).to.be.false;
    });

    // --- V1 Tests ---

    it("should not warn if trigger region is a US region for V1", async () => {
      storageStub.resolves({ location: "US" });
      const ep: backend.Endpoint = {
        id: "v1fn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));
      expect(logWarningSpy.called).to.be.false;
    });

    it("should not warn if trigger region is another specific US region like us-east1 for V1", async () => {
      storageStub.resolves({ location: "US-EAST1" });
      const ep: backend.Endpoint = {
        id: "v1fn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));
      expect(logWarningSpy.called).to.be.false;
    });

    it("should warn for V1 storage function if bucket is non-US", async () => {
      storageStub.resolves({ location: "EUROPE-WEST1" });
      const ep: backend.Endpoint = {
        id: "v1fn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));

      expect(logWarningSpy.calledOnce).to.be.true;
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "- v1fn (us-central1, Trigger: europe-west1)",
      );
    });

    it("should handle short-form bucket resource names for V1 storage", async () => {
      storageStub.withArgs("my-bucket").resolves({ location: "EUROPE-WEST1" });
      const ep: backend.Endpoint = {
        id: "v1fn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "my-bucket" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));

      expect(logWarningSpy.calledOnce).to.be.true;
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "- v1fn (us-central1, Trigger: europe-west1)",
      );
    });

    it("should silently catch and handle failed V1 lookups", async () => {
      storageStub.rejects(new Error("Access Denied"));
      const ep: backend.Endpoint = {
        id: "v1fn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      // The deployment shouldn't fail with an error
      await expect(triggerRegionHelper.ensureTriggerRegions(backend.of(ep))).to.be.fulfilled;
      expect(logWarningSpy.called).to.be.false;
    });

    it("should warn for V1 firestore function if database location is non-US", async () => {
      firestoreStub.resolves({ locationId: "EUROPE-WEST1" });
      const ep: backend.Endpoint = {
        id: "v1fs",
        entryPoint: "v1fs",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "providers/cloud.firestore/eventTypes/document.create",
          eventFilters: { resource: "projects/_/databases/(default)/documents/users/{uid}" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));

      expect(logWarningSpy.calledOnce).to.be.true;
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "- v1fs (us-central1, Trigger: europe-west1)",
      );
    });

    it("should warn for V1 database function if instance location is non-US", async () => {
      databaseStub.resolves({ location: "europe-west1" });
      const ep: backend.Endpoint = {
        id: "v1db",
        entryPoint: "v1db",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "providers/google.firebase.database/eventTypes/ref.create",
          eventFilters: { resource: "projects/_/instances/my-instance/refs/users/{uid}" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));

      expect(logWarningSpy.calledOnce).to.be.true;
      expect(logWarningSpy.firstCall.args[1]).to.include(
        "- v1db (us-central1, Trigger: europe-west1)",
      );
    });

    it("should skip warnings when FIREBASE_SUPPRESS_REGION_WARNING=true for V1", async () => {
      process.env.FIREBASE_SUPPRESS_REGION_WARNING = "true";
      storageStub.resolves({ location: "EUROPE-WEST1" });
      const ep: backend.Endpoint = {
        id: "v1fn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));

      expect(logWarningSpy.called).to.be.false;
    });

    it("should not warn when a V1 function matches a US multi-region trigger", async () => {
      storageStub.resolves({ location: "NAM5" });
      const ep: backend.Endpoint = {
        id: "v1fs",
        entryPoint: "v1fs",
        platform: "gcfv1",
        region: "us-central1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        project: "my-project",
        runtime: "nodejs14" as const,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(ep));
      expect(logWarningSpy.called).to.be.false;
    });
  });
});
