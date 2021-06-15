import * as nock from "nock";
import * as api from "../../api";
import * as provisioningHelper from "../../extensions/provisioningHelper";
import * as extensionsApi from "../../extensions/extensionsApi";
import { expect } from "chai";
import { FirebaseError } from "../../error";

const TEST_INSTANCES_RESPONSE = {};
const PROJECT_ID = "test-project";

const PROVISIONED_DEFAULT_BUCKEET = {
  defaultBucket: "default-bucket",
};
const FIREBASE_STORAGE_BUCKEETS = {
  buckets: ["bucket1", "bucket2"],
};
const FIREBASE_PRODUCT_ACTIVATIONS = {
  activation: [
    {
      service: "FIREBASE_AUTH",
    },
  ],
};

describe.only("provisioningHelper", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("getUsedProducts", () => {
    it("returns empty array when nothing is used", () => {
      expect(
        provisioningHelper.getUsedProducts({
          apis: [
            {
              apiName: "unrelated.googleapis.com",
            },
          ] as extensionsApi.Api[],
          roles: [
            {
              role: "unrelated.role",
            },
          ] as extensionsApi.Role[],
          resources: [
            {
              propertiesYaml:
                "availableMemoryMb: 1024\neventTrigger:\n  eventType: providers/unrelates.service/eventTypes/something.do\n  resource: projects/_/buckets/${param:IMG_BUCKET}\nlocation: ${param:LOCATION}\nruntime: nodejs10\n",
            },
          ] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.empty;
    });
    it("returns STORAGE when Storage API is used", () => {
      expect(
        provisioningHelper.getUsedProducts({
          apis: [
            {
              apiName: "storage-component.googleapis.com",
            },
          ] as extensionsApi.Api[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.deep.eq([provisioningHelper.DeferredProduct.STORAGE]);
    });
    it("returns STORAGE when Storage Role is used", () => {
      expect(
        provisioningHelper.getUsedProducts({
          roles: [
            {
              role: "storage.object.admin",
            },
          ] as extensionsApi.Role[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.deep.eq([provisioningHelper.DeferredProduct.STORAGE]);
    });
    it("returns STORAGE when Storage trigger is used", () => {
      expect(
        provisioningHelper.getUsedProducts({
          resources: [
            {
              propertiesYaml:
                "availableMemoryMb: 1024\neventTrigger:\n  eventType: google.storage.object.finalize\n  resource: projects/_/buckets/${param:IMG_BUCKET}\nlocation: ${param:LOCATION}\nruntime: nodejs10\n",
            },
          ] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.deep.eq([provisioningHelper.DeferredProduct.STORAGE]);
    });
    it("returns AUTH when Authentication API is used", () => {
      expect(
        provisioningHelper.getUsedProducts({
          apis: [
            {
              apiName: "identitytoolkit.googleapis.com",
            },
          ] as extensionsApi.Api[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.deep.eq([provisioningHelper.DeferredProduct.AUTH]);
    });
    it("returns AUTH when Authentication Role is used", () => {
      expect(
        provisioningHelper.getUsedProducts({
          roles: [
            {
              role: "firebaseauth.user.admin",
            },
          ] as extensionsApi.Role[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.deep.eq([provisioningHelper.DeferredProduct.AUTH]);
    });
    it("returns AUTH when Auth trigger is used", () => {
      expect(
        provisioningHelper.getUsedProducts({
          resources: [
            {
              propertiesYaml:
                "availableMemoryMb: 1024\neventTrigger:\n  eventType: providers/firebase.auth/eventTypes/user.create\n  resource: projects/_/buckets/${param:IMG_BUCKET}\nlocation: ${param:LOCATION}\nruntime: nodejs10\n",
            },
          ] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.deep.eq([provisioningHelper.DeferredProduct.AUTH]);
    });
  });

  describe("checkProductsProvisioned", () => {
    it("passes provisioning check status when nothing is used", async () => {
      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, {
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.fulfilled;
    });
    it("passes provisioning check when all is provisioned", async () => {
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREBASE_PRODUCT_ACTIVATIONS);
      nock(api.appengineOrigin)
        .get(`/v1/apps/${PROJECT_ID}`)
        .reply(200, PROVISIONED_DEFAULT_BUCKEET);
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, {
          buckets: ["bucket1", "bucket2"],
        });

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, {
          apis: [
            {
              apiName: "storage-component.googleapis.com",
            },
            {
              apiName: "identitytoolkit.googleapis.com",
            },
          ] as extensionsApi.Api[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.fulfilled;

      expect(nock.isDone()).to.be.true;
    });
    it("fails provisioning check storage when default bucket is not set", async () => {
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREBASE_PRODUCT_ACTIVATIONS);
      nock(api.appengineOrigin).get(`/v1/apps/${PROJECT_ID}`).reply(200, {
        defaultBucket: "undefined",
      });
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, FIREBASE_STORAGE_BUCKEETS);

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, {
          apis: [
            {
              apiName: "storage-component.googleapis.com",
            },
            {
              apiName: "identitytoolkit.googleapis.com",
            },
          ] as extensionsApi.Api[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.rejectedWith(FirebaseError, "Firebase Storage: store and retrieve user-generated");

      expect(nock.isDone()).to.be.true;
    });
    it("fails provisioning check storage when no firebase storage buckets", async () => {
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREBASE_PRODUCT_ACTIVATIONS);
      nock(api.appengineOrigin)
        .get(`/v1/apps/${PROJECT_ID}`)
        .reply(200, PROVISIONED_DEFAULT_BUCKEET);
      nock(api.firebaseStorageOrigin).get(`/v1beta/projects/${PROJECT_ID}/buckets`).reply(200, {});

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, {
          apis: [
            {
              apiName: "storage-component.googleapis.com",
            },
            {
              apiName: "identitytoolkit.googleapis.com",
            },
          ] as extensionsApi.Api[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.rejectedWith(FirebaseError, "Firebase Storage: store and retrieve user-generated");

      expect(nock.isDone()).to.be.true;
    });
    it("fails provisioning check storage when no auth is not provisioned", async () => {
      nock(api.firedataOrigin).get(`/v1/projects/${PROJECT_ID}/products`).reply(200, {});
      nock(api.appengineOrigin)
        .get(`/v1/apps/${PROJECT_ID}`)
        .reply(200, PROVISIONED_DEFAULT_BUCKEET);
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, FIREBASE_STORAGE_BUCKEETS);

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, {
          apis: [
            {
              apiName: "storage-component.googleapis.com",
            },
            {
              apiName: "identitytoolkit.googleapis.com",
            },
          ] as extensionsApi.Api[],
          resources: [] as extensionsApi.Resource[],
        } as extensionsApi.ExtensionSpec)
      ).to.be.rejectedWith(
        FirebaseError,
        "Firebase Authentication: authenticate and manage users from"
      );

      expect(nock.isDone()).to.be.true;
    });
  });
});
