import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import * as triggerRegionHelper from "./triggerRegionHelper";
import * as utils from "../../utils";
import * as firestore from "../../gcp/firestore";
import * as firestoreService from "./services/firestore";

const SPEC = {
  region: "us-west1",
  project: "my-project",
  runtime: "nodejs14" as const,
};

describe("TriggerRegionHelper", () => {
  describe("ensureTriggerRegions", () => {
    let storageStub: sinon.SinonStub;
    let firestoreStub: sinon.SinonStub;

    beforeEach(() => {
      storageStub = sinon.stub(storage, "getBucket").throws("unexpected call to storage.getBucket");
      firestoreStub = sinon
        .stub(firestore, "getDatabase")
        .throws("unexpected call to firestore.getDatabase");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

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

    it("should skip v1 and callable functions", async () => {
      const v1EventFn: backend.Endpoint = {
        id: "v1eventfn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        ...SPEC,
      };
      const v2CallableFn: backend.Endpoint = {
        id: "v2callablefn",
        entryPoint: "v2callablefn",
        platform: "gcfv2",
        httpsTrigger: {},
        ...SPEC,
      };

      await triggerRegionHelper.ensureTriggerRegions(backend.of(v1EventFn, v2CallableFn));

      const want: backend.EventTrigger = {
        eventType: "google.storage.object.create",
        eventFilters: { resource: "projects/_/buckets/my-bucket" },
        retry: false,
      };

      expect(v1EventFn.eventTrigger).to.deep.eq(want);
      expect(v2CallableFn.httpsTrigger).to.deep.eq({});
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
        region: "europe-west4",
      };

      await expect(triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn))).to.be.rejectedWith(
        "A function in region europe-west4 cannot listen to a bucket in region us",
      );
    });

    it("should warn on transatlantic latency hops", async () => {
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

      const logLabeledWarningStub = sinon.stub(utils, "logLabeledWarning");

      await triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn));

      expect(logLabeledWarningStub).to.have.been.calledOnceWith(
        "functions",
        `Function wantFn located in us-central1 uses a trigger located in europe-west1. ` +
          `To avoid unnecessary cross-region network hops, you should explicitly assign this function to europe-west1.`,
      );

      logLabeledWarningStub.restore();
    });

    it("should not warn when regions match", async () => {
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

      const logLabeledWarningStub = sinon.stub(utils, "logLabeledWarning");
      firestoreService.clearCache();

      await triggerRegionHelper.ensureTriggerRegions(backend.of(wantFn));

      expect(logLabeledWarningStub).to.not.have.been.called;

      logLabeledWarningStub.restore();
    });
  });
});
