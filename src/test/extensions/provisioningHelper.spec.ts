import * as nock from "nock";
import { expect } from "chai";

import * as api from "../../api";
import * as provisioningHelper from "../../extensions/provisioningHelper";
import { Api, ExtensionSpec, Resource, Role } from "../../extensions/types";
import { FirebaseError } from "../../error";

const PROJECT_ID = "test-project";

const SPEC_WITH_NOTHING = {
  apis: [] as Api[],
  resources: [] as Resource[],
} as ExtensionSpec;

const SPEC_WITH_STORAGE = {
  apis: [
    {
      apiName: "storage-component.googleapis.com",
    },
  ] as Api[],
  resources: [] as Resource[],
} as ExtensionSpec;

const SPEC_WITH_AUTH = {
  apis: [
    {
      apiName: "identitytoolkit.googleapis.com",
    },
  ] as Api[],
  resources: [] as Resource[],
} as ExtensionSpec;

const SPEC_WITH_STORAGE_AND_AUTH = {
  apis: [
    {
      apiName: "storage-component.googleapis.com",
    },
    {
      apiName: "identitytoolkit.googleapis.com",
    },
  ] as Api[],
  resources: [] as Resource[],
} as ExtensionSpec;

const FIREDATA_AUTH_ACTIVATED_RESPONSE = {
  activation: [
    {
      service: "FIREBASE_AUTH",
    },
  ],
};

const FIREBASE_STORAGE_DEFAULT_BUCKET_LINKED_RESPONSE = {
  buckets: [
    {
      name: `projects/12345/bucket/${PROJECT_ID}.appspot.com`,
    },
  ],
};

const extensionVersionResponse = (version: string, spec: ExtensionSpec) => {
  return {
    name: `publishers/test/extensions/test/version/${version}`,
    ref: `test/test@${version}`,
    hash: "abc",
    sourceDownloadUri: "https://firebase.com",
    spec,
  };
};

const instanceSpec = (version: string) => {
  return {
    instanceId: "test",
    params: {},
    ref: {
      publisherId: "test",
      extensionId: "test",
      version,
    },
  };
};

describe("provisioningHelper", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("getUsedProducts", () => {
    let testSpec: ExtensionSpec;

    beforeEach(() => {
      testSpec = {
        apis: [
          {
            apiName: "unrelated.googleapis.com",
          },
        ] as Api[],
        roles: [
          {
            role: "unrelated.role",
          },
        ] as Role[],
        resources: [
          {
            propertiesYaml:
              "availableMemoryMb: 1024\neventTrigger:\n  eventType: providers/unrelates.service/eventTypes/something.do\n  resource: projects/_/buckets/${param:IMG_BUCKET}\nlocation: ${param:LOCATION}\nruntime: nodejs10\n",
          },
        ] as Resource[],
      } as ExtensionSpec;
    });

    it("returns empty array when nothing is used", () => {
      expect(provisioningHelper.getUsedProducts(testSpec)).to.be.empty;
    });

    it("returns STORAGE when Storage API is used", () => {
      testSpec.apis?.push({
        apiName: "storage-component.googleapis.com",
        reason: "whatever",
      });
      expect(provisioningHelper.getUsedProducts(testSpec)).to.be.deep.eq([
        provisioningHelper.DeferredProduct.STORAGE,
      ]);
    });

    it("returns STORAGE when Storage Role is used", () => {
      testSpec.roles?.push({
        role: "storage.object.admin",
        reason: "whatever",
      });
      expect(provisioningHelper.getUsedProducts(testSpec)).to.be.deep.eq([
        provisioningHelper.DeferredProduct.STORAGE,
      ]);
    });

    it("returns STORAGE when Storage trigger is used", () => {
      testSpec.resources?.push({
        propertiesYaml:
          "availableMemoryMb: 1024\neventTrigger:\n  eventType: google.storage.object.finalize\n  resource: projects/_/buckets/${param:IMG_BUCKET}\nlocation: ${param:LOCATION}\nruntime: nodejs10\n",
      } as Resource);
      expect(provisioningHelper.getUsedProducts(testSpec)).to.be.deep.eq([
        provisioningHelper.DeferredProduct.STORAGE,
      ]);
    });

    it("returns AUTH when Authentication API is used", () => {
      testSpec.apis?.push({
        apiName: "identitytoolkit.googleapis.com",
        reason: "whatever",
      });
      expect(provisioningHelper.getUsedProducts(testSpec)).to.be.deep.eq([
        provisioningHelper.DeferredProduct.AUTH,
      ]);
    });

    it("returns AUTH when Authentication Role is used", () => {
      testSpec.roles?.push({
        role: "firebaseauth.user.admin",
        reason: "whatever",
      });
      expect(provisioningHelper.getUsedProducts(testSpec)).to.be.deep.eq([
        provisioningHelper.DeferredProduct.AUTH,
      ]);
    });

    it("returns AUTH when Auth trigger is used", () => {
      testSpec.resources?.push({
        propertiesYaml:
          "availableMemoryMb: 1024\neventTrigger:\n  eventType: providers/firebase.auth/eventTypes/user.create\n  resource: projects/_/buckets/${param:IMG_BUCKET}\nlocation: ${param:LOCATION}\nruntime: nodejs10\n",
      } as Resource);
      expect(provisioningHelper.getUsedProducts(testSpec)).to.be.deep.eq([
        provisioningHelper.DeferredProduct.AUTH,
      ]);
    });
  });

  describe("checkProductsProvisioned", () => {
    it("passes provisioning check status when nothing is used", async () => {
      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, {
          resources: [] as Resource[],
        } as ExtensionSpec),
      ).to.be.fulfilled;
    });

    it("passes provisioning check when all is provisioned", async () => {
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREDATA_AUTH_ACTIVATED_RESPONSE);
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, FIREBASE_STORAGE_DEFAULT_BUCKET_LINKED_RESPONSE);

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, SPEC_WITH_STORAGE_AND_AUTH),
      ).to.be.fulfilled;

      expect(nock.isDone()).to.be.true;
    });

    it("fails provisioning check storage when default bucket is not linked", async () => {
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREDATA_AUTH_ACTIVATED_RESPONSE);
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, {
          buckets: [
            {
              name: `projects/12345/bucket/some-other-bucket`,
            },
          ],
        });

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, SPEC_WITH_STORAGE_AND_AUTH),
      ).to.be.rejectedWith(FirebaseError, "Firebase Storage: store and retrieve user-generated");

      expect(nock.isDone()).to.be.true;
    });

    it("fails provisioning check storage when no firebase storage buckets", async () => {
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREDATA_AUTH_ACTIVATED_RESPONSE);
      nock(api.firebaseStorageOrigin).get(`/v1beta/projects/${PROJECT_ID}/buckets`).reply(200, {});

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, SPEC_WITH_STORAGE_AND_AUTH),
      ).to.be.rejectedWith(FirebaseError, "Firebase Storage: store and retrieve user-generated");

      expect(nock.isDone()).to.be.true;
    });

    it("fails provisioning check storage when no auth is not provisioned", async () => {
      nock(api.firedataOrigin).get(`/v1/projects/${PROJECT_ID}/products`).reply(200, {});
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, FIREBASE_STORAGE_DEFAULT_BUCKET_LINKED_RESPONSE);

      await expect(
        provisioningHelper.checkProductsProvisioned(PROJECT_ID, SPEC_WITH_STORAGE_AND_AUTH),
      ).to.be.rejectedWith(
        FirebaseError,
        "Firebase Authentication: authenticate and manage users from",
      );

      expect(nock.isDone()).to.be.true;
    });
  });

  describe("bulkCheckProductsProvisioned", () => {
    it("passes provisioning check status when nothing is used", async () => {
      nock(api.extensionsOrigin)
        .get(`/v1beta/publishers/test/extensions/test/versions/0.1.0`)
        .reply(200, extensionVersionResponse("0.1.0", SPEC_WITH_NOTHING));

      await expect(
        provisioningHelper.bulkCheckProductsProvisioned(PROJECT_ID, [instanceSpec("0.1.0")]),
      ).to.be.fulfilled;
    });

    it("passes provisioning check when all is provisioned", async () => {
      nock(api.extensionsOrigin)
        .get(`/v1beta/publishers/test/extensions/test/versions/0.1.0`)
        .reply(200, extensionVersionResponse("0.1.0", SPEC_WITH_STORAGE_AND_AUTH));
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREDATA_AUTH_ACTIVATED_RESPONSE);
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, FIREBASE_STORAGE_DEFAULT_BUCKET_LINKED_RESPONSE);

      await expect(
        provisioningHelper.bulkCheckProductsProvisioned(PROJECT_ID, [instanceSpec("0.1.0")]),
      ).to.be.fulfilled;

      expect(nock.isDone()).to.be.true;
    });

    it("checks all products for multiple versions", async () => {
      nock(api.extensionsOrigin)
        .get(`/v1beta/publishers/test/extensions/test/versions/0.1.0`)
        .reply(200, extensionVersionResponse("0.1.0", SPEC_WITH_STORAGE));
      nock(api.extensionsOrigin)
        .get(`/v1beta/publishers/test/extensions/test/versions/0.1.1`)
        .reply(200, extensionVersionResponse("0.1.1", SPEC_WITH_AUTH));
      nock(api.firedataOrigin)
        .get(`/v1/projects/${PROJECT_ID}/products`)
        .reply(200, FIREDATA_AUTH_ACTIVATED_RESPONSE);
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, FIREBASE_STORAGE_DEFAULT_BUCKET_LINKED_RESPONSE);

      await expect(
        provisioningHelper.bulkCheckProductsProvisioned(PROJECT_ID, [
          instanceSpec("0.1.0"),
          instanceSpec("0.1.1"),
        ]),
      ).to.be.fulfilled;

      expect(nock.isDone()).to.be.true;
    });

    it("fails provisioning check storage when default bucket is not linked", async () => {
      nock(api.extensionsOrigin)
        .get(`/v1beta/publishers/test/extensions/test/versions/0.1.0`)
        .reply(200, extensionVersionResponse("0.1.0", SPEC_WITH_STORAGE));
      nock(api.firebaseStorageOrigin)
        .get(`/v1beta/projects/${PROJECT_ID}/buckets`)
        .reply(200, {
          buckets: [
            {
              name: `projects/12345/bucket/some-other-bucket`,
            },
          ],
        });

      await expect(
        provisioningHelper.bulkCheckProductsProvisioned(PROJECT_ID, [instanceSpec("0.1.0")]),
      ).to.be.rejectedWith(FirebaseError, "Firebase Storage: store and retrieve user-generated");

      expect(nock.isDone()).to.be.true;
    });

    it("fails provisioning check storage when no auth is not provisioned", async () => {
      nock(api.extensionsOrigin)
        .get(`/v1beta/publishers/test/extensions/test/versions/0.1.0`)
        .reply(200, extensionVersionResponse("0.1.0", SPEC_WITH_AUTH));
      nock(api.firedataOrigin).get(`/v1/projects/${PROJECT_ID}/products`).reply(200, {});

      await expect(
        provisioningHelper.bulkCheckProductsProvisioned(PROJECT_ID, [instanceSpec("0.1.0")]),
      ).to.be.rejectedWith(
        FirebaseError,
        "Firebase Authentication: authenticate and manage users from",
      );

      expect(nock.isDone()).to.be.true;
    });
  });
});
