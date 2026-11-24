import { expect } from "chai";
import * as sinon from "sinon";
import { Endpoint, EventTrigger, EventTriggered } from "../backend";
import {
  obtainStorageBindings,
  getBucket,
  clearCache,
  ensureStorageTriggerRegion,
} from "./storage";
import * as storage from "../../../gcp/storage";

const projectNumber = "123456789";

const STORAGE_RES = {
  email_address: "service-123@gs-project-accounts.iam.gserviceaccount.com",
  kind: "storage#serviceAccount",
};

function storageEndpoint(
  region: string,
  eventTrigger: Partial<EventTrigger> = {},
): Endpoint & EventTriggered {
  return {
    id: "endpoint",
    region,
    project: projectNumber,
    eventTrigger: {
      retry: false,
      eventType: "google.cloud.storage.object.v1.finalized",
      eventFilters: { bucket: "my-bucket" },
      ...eventTrigger,
    },
    entryPoint: "endpoint",
    platform: "gcfv2",
    runtime: "nodejs22",
  };
}

describe("storage service", () => {
  let storageStub: sinon.SinonStub;

  beforeEach(() => {
    clearCache();
    storageStub = sinon
      .stub(storage, "getServiceAccount")
      .throws("unexpected call to storage.getServiceAccount");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("obtainStorageBindings", () => {
    it("should return the correct storage binding", async () => {
      storageStub.resolves(STORAGE_RES);

      const bindings = await obtainStorageBindings(projectNumber);

      expect(bindings.length).to.equal(1);
      expect(bindings[0]).to.deep.equal({
        role: "roles/pubsub.publisher",
        members: [`serviceAccount:${STORAGE_RES.email_address}`],
      });
    });
  });

  describe("getBucket", () => {
    let getBucketStub: sinon.SinonStub;

    beforeEach(() => {
      getBucketStub = sinon
        .stub(storage, "getBucket")
        .throws("unexpected call to storage.getBucket");
    });

    it("should cache bucket lookups to prevent multiple API calls", async () => {
      const bucketResp = { location: "US" } as any;
      getBucketStub.resolves(bucketResp);

      const b1 = await getBucket("bucket1");
      const b2 = await getBucket("bucket1");

      expect(b1).to.deep.equal(bucketResp);
      expect(b2).to.deep.equal(bucketResp);
      expect(getBucketStub).to.have.been.calledOnce;
    });

    it("should make separate API calls for different buckets", async () => {
      getBucketStub.onFirstCall().resolves({ location: "US" });
      getBucketStub.onSecondCall().resolves({ location: "EU" });

      const b1 = await getBucket("bucket1");
      const b2 = await getBucket("bucket2");

      expect(b1.location).to.eq("US");
      expect(b2.location).to.eq("EU");
      expect(getBucketStub).to.have.been.calledTwice;
    });
  });

  describe("ensureStorageTriggerRegion", () => {
    let getBucketStub: sinon.SinonStub;

    beforeEach(() => {
      getBucketStub = sinon
        .stub(storage, "getBucket")
        .throws("unexpected call to storage.getBucket");
    });

    const crossRegionCases: Array<{ functionRegion: string; bucketLocation: string }> = [
      { functionRegion: "europe-west1", bucketLocation: "EUROPE-WEST2" },
      { functionRegion: "us-east1", bucketLocation: "EU" },
      { functionRegion: "europe-west1", bucketLocation: "US-CENTRAL1" },
      { functionRegion: "europe-west1", bucketLocation: "EU" },
    ];
    for (const { functionRegion, bucketLocation } of crossRegionCases) {
      it(`should set the trigger region for a function in ${functionRegion} and a bucket in ${bucketLocation}`, async () => {
        getBucketStub.resolves({ location: bucketLocation });
        const ep = storageEndpoint(functionRegion);

        await ensureStorageTriggerRegion(ep);

        expect(ep.eventTrigger.region).to.eq(bucketLocation.toLowerCase());
        expect(ep.region).to.eq(functionRegion);
      });
    }

    it("should keep a trigger region that differs from the function region", async () => {
      const ep = storageEndpoint("europe-west1", { region: "europe-west2" });

      await ensureStorageTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("europe-west2");
      expect(getBucketStub).not.to.have.been.called;
    });

    it("should error if the bucket filter is missing", async () => {
      const ep = storageEndpoint("europe-west1", { eventFilters: {} });

      await expect(ensureStorageTriggerRegion(ep)).to.be.rejectedWith(
        "storage event trigger is missing bucket filter",
      );
    });

    it("should error if the bucket lookup fails", async () => {
      getBucketStub.rejects(new Error("not found"));
      const ep = storageEndpoint("europe-west1");

      await expect(ensureStorageTriggerRegion(ep)).to.be.rejectedWith(
        "Can't find the storage bucket region",
      );
    });
  });
});
