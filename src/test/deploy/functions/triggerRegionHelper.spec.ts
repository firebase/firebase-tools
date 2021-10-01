import { expect } from "chai";
import * as sinon from "sinon";
import { FunctionSpec } from "../../../deploy/functions/backend";
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

    it("should skip v1 and callable functions", async () => {
      const v1EventFn: FunctionSpec = {
        id: "v1eventfn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        trigger: {
          eventType: "google.cloud.audit.log.v1.written",
          eventFilters: {},
          retry: false,
        },
        ...SPEC,
      };
      const v2CallableFn: FunctionSpec = {
        id: "v2callablefn",
        entryPoint: "v2callablefn",
        platform: "gcfv2",
        trigger: {},
        ...SPEC,
      };

      await triggerRegionHelper.setTriggerRegion([v1EventFn, v2CallableFn], []);

      expect(v1EventFn.trigger).to.deep.eq({
        eventType: "google.cloud.audit.log.v1.written",
        eventFilters: {},
        retry: false,
      });
      expect(v2CallableFn.trigger).to.deep.eq({});
    });

    it("should match trigger region from have functions", async () => {
      const wantFn: FunctionSpec = {
        id: "fn",
        entryPoint: "fn",
        platform: "gcfv2",
        trigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: {},
          retry: false,
        },
        ...SPEC,
      };
      const haveFn: FunctionSpec = {
        id: "fn",
        entryPoint: "fn",
        platform: "gcfv2",
        trigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: {},
          retry: false,
          region: "us",
        },
        ...SPEC,
      };

      await triggerRegionHelper.setTriggerRegion([wantFn], [haveFn]);

      expect(wantFn.trigger).to.deep.eq({
        eventType: "google.cloud.storage.object.v1.finalized",
        eventFilters: {},
        retry: false,
        region: "us",
      });
    });

    it("should set trigger region from API", async () => {
      storageStub.resolves({ location: "US" });
      const wantFn: FunctionSpec = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        trigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: {
            bucket: "my-bucket",
          },
          retry: false,
        },
        ...SPEC,
      };

      await triggerRegionHelper.setTriggerRegion([wantFn], []);

      expect(wantFn.trigger).to.deep.eq({
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
