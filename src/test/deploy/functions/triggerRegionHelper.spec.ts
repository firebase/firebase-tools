import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "../../../deploy/functions/backend";
import * as storage from "../../../gcp/storage";
import * as triggerRegionHelper from "../../../deploy/functions/triggerRegionHelper";

const SPEC = {
  region: "us-west1",
  project: "my-project",
  runtime: "nodejs14",
};

describe("TriggerRegionHelper", () => {
  describe("setTriggerRegion", () => {
    let storageStub: sinon.SinonStub;

    beforeEach(() => {
      storageStub = sinon.stub(storage, "getBucket").throws("Do not call");
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
          eventFilters: {
            bucket: "my-bucket",
          },
          retry: false,
        },
        ...SPEC,
      };

      await expect(
        triggerRegionHelper.lookupMissingTriggerRegions(backend.of(ep))
      ).to.be.rejectedWith("Can't find the storage bucket region");
    });

    it("should skip v1 and callable functions", async () => {
      const v1EventFn: backend.Endpoint = {
        id: "v1eventfn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: {
            resource: "projects/_/buckets/myBucket",
          },
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

      await triggerRegionHelper.lookupMissingTriggerRegions(backend.of(v1EventFn, v2CallableFn));

      expect(v1EventFn.eventTrigger).to.deep.eq({
        eventType: "google.storage.object.create",
        eventFilters: {
          resource: "projects/_/buckets/myBucket",
        },
        retry: false,
      });
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
          eventFilters: {
            bucket: "my-bucket",
          },
          retry: false,
        },
        ...SPEC,
      };

      await triggerRegionHelper.lookupMissingTriggerRegions(backend.of(wantFn));

      expect(wantFn.eventTrigger).to.deep.eq({
        eventType: "google.cloud.storage.object.v1.finalized",
        eventFilters: {
          bucket: "my-bucket",
        },
        retry: false,
        region: "us",
      });
    });
  });
});
