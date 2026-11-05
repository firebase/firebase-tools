import { expect } from "chai";
import * as sinon from "sinon";
import { obtainStorageBindings, getBucket, clearCache } from "./storage";
import * as storage from "../../../gcp/storage";

const projectNumber = "123456789";

const STORAGE_RES = {
  email_address: "service-123@gs-project-accounts.iam.gserviceaccount.com",
  kind: "storage#serviceAccount",
};

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
});
