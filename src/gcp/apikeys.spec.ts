import { expect } from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";

import * as apikeys from "./apikeys";
import { apiKeysOrigin } from "../api";
import * as operationPoller from "../operation-poller";

describe("apikeys", () => {
  const sandbox = sinon.createSandbox();

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("lookupKey", () => {
    it("should resolve with key lookup metadata on success", async () => {
      const lookupResponse: apikeys.LookupKeyResponse = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        parent: "projects/12345/locations/global",
        displayName: "Browser key",
      };

      nock(apiKeysOrigin())
        .get("/v2/keys:lookupKey")
        .query({ keyString: "AIzaSyFakeKeyString" })
        .reply(200, lookupResponse);

      const res = await apikeys.lookupKey("AIzaSyFakeKeyString");
      expect(res).to.deep.equal(lookupResponse);
    });

    it("should reject if API returns an error", async () => {
      nock(apiKeysOrigin())
        .get("/v2/keys:lookupKey")
        .query({ keyString: "invalid-key" })
        .reply(404, { error: { message: "Key not found" } });

      await expect(apikeys.lookupKey("invalid-key")).to.be.rejected;
    });
  });

  describe("getKey", () => {
    it("should resolve with the key resource", async () => {
      const key: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          apiTargets: [{ service: "identitytoolkit.googleapis.com" }],
        },
      };

      nock(apiKeysOrigin())
        .get("/v2/projects/12345/locations/global/keys/abcd-1234")
        .reply(200, key);

      const res = await apikeys.getKey("projects/12345/locations/global/keys/abcd-1234");
      expect(res).to.deep.equal(key);
    });
  });

  describe("getKeyByString", () => {
    it("should lookup and fetch the full key resource", async () => {
      const lookupResponse: apikeys.LookupKeyResponse = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        parent: "projects/12345/locations/global",
        displayName: "Browser key",
      };
      const key: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {},
      };

      nock(apiKeysOrigin())
        .get("/v2/keys:lookupKey")
        .query({ keyString: "AIzaSyFakeKeyString" })
        .reply(200, lookupResponse);

      nock(apiKeysOrigin())
        .get("/v2/projects/12345/locations/global/keys/abcd-1234")
        .reply(200, key);

      const res = await apikeys.getKeyByString("AIzaSyFakeKeyString");
      expect(res).to.deep.equal(key);
    });
  });

  describe("listKeys", () => {
    it("should list all keys for a project across multiple pages", async () => {
      const page1Keys: apikeys.Key[] = [
        { name: "projects/test-project/locations/global/keys/key-1", displayName: "Key 1" },
      ];
      const page2Keys: apikeys.Key[] = [
        { name: "projects/test-project/locations/global/keys/key-2", displayName: "Key 2" },
      ];

      nock(apiKeysOrigin())
        .get("/v2/projects/test-project/locations/global/keys")
        .reply(200, { keys: page1Keys, nextPageToken: "page-2-token" });

      nock(apiKeysOrigin())
        .get("/v2/projects/test-project/locations/global/keys")
        .query({ pageToken: "page-2-token" })
        .reply(200, { keys: page2Keys });

      const res = await apikeys.listKeys("test-project");
      expect(res).to.deep.equal([...page1Keys, ...page2Keys]);
    });

    it("should return empty array if no keys are found", async () => {
      nock(apiKeysOrigin())
        .get("/v2/projects/test-project/locations/global/keys")
        .reply(200, {});

      const res = await apikeys.listKeys("test-project");
      expect(res).to.deep.equal([]);
    });
  });

  describe("updateKey", () => {
    it("should return the response directly when LRO is already done", async () => {
      const updatedKey: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          apiTargets: [{ service: "firebasetelemetry.googleapis.com" }],
        },
      };

      nock(apiKeysOrigin())
        .patch("/v2/projects/12345/locations/global/keys/abcd-1234")
        .query({ updateMask: "restrictions" })
        .reply(200, {
          name: "operations/op-123",
          done: true,
          response: updatedKey,
        });

      const res = await apikeys.updateKey(updatedKey, ["restrictions"]);
      expect(res).to.deep.equal(updatedKey);
    });

    it("should poll the operation when LRO is not immediately done", async () => {
      const updatedKey: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          apiTargets: [{ service: "firebasetelemetry.googleapis.com" }],
        },
      };

      nock(apiKeysOrigin())
        .patch("/v2/projects/12345/locations/global/keys/abcd-1234")
        .query({ updateMask: "restrictions" })
        .reply(200, {
          name: "operations/op-123",
          done: false,
        });

      sandbox.stub(operationPoller, "pollOperation").resolves(updatedKey);

      const res = await apikeys.updateKey(updatedKey, ["restrictions"]);
      expect(res).to.deep.equal(updatedKey);
      expect(operationPoller.pollOperation).to.have.been.calledWith({
        apiOrigin: apiKeysOrigin(),
        apiVersion: "v2",
        operationResourceName: "operations/op-123",
      });
    });
  });

  describe("ensureServiceInKeyRestrictions", () => {
    it("should do nothing if key has no apiTargets restrictions (unrestricted)", async () => {
      const key: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          browserKeyRestrictions: { allowedReferrers: ["https://example.com/*"] },
        },
      };

      nock(apiKeysOrigin())
        .get("/v2/keys:lookupKey")
        .query({ keyString: "AIzaSyFakeKeyString" })
        .reply(200, { name: key.name });

      nock(apiKeysOrigin())
        .get("/v2/projects/12345/locations/global/keys/abcd-1234")
        .reply(200, key);

      const res = await apikeys.ensureServiceInKeyRestrictions(
        "AIzaSyFakeKeyString",
        "firebasetelemetry.googleapis.com",
      );

      expect(res.updated).to.be.false;
      expect(res.key).to.deep.equal(key);
    });

    it("should accept a Key object directly without looking up keyString", async () => {
      const key: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          apiTargets: [{ service: "identitytoolkit.googleapis.com" }],
        },
      };

      const updatedKey: apikeys.Key = {
        ...key,
        restrictions: {
          apiTargets: [
            { service: "identitytoolkit.googleapis.com" },
            { service: "firebasetelemetry.googleapis.com" },
          ],
        },
      };

      nock(apiKeysOrigin())
        .patch("/v2/projects/12345/locations/global/keys/abcd-1234")
        .query({ updateMask: "restrictions" })
        .reply(200, {
          name: "operations/op-123",
          done: true,
          response: updatedKey,
        });

      const res = await apikeys.ensureServiceInKeyRestrictions(
        key,
        "firebasetelemetry.googleapis.com",
      );

      expect(res.updated).to.be.true;
      expect(res.key).to.deep.equal(updatedKey);
    });

    it("should do nothing if apiTargets is empty", async () => {
      const key: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          apiTargets: [],
        },
      };

      nock(apiKeysOrigin())
        .get("/v2/keys:lookupKey")
        .query({ keyString: "AIzaSyFakeKeyString" })
        .reply(200, { name: key.name });

      nock(apiKeysOrigin())
        .get("/v2/projects/12345/locations/global/keys/abcd-1234")
        .reply(200, key);

      const res = await apikeys.ensureServiceInKeyRestrictions(
        "AIzaSyFakeKeyString",
        "firebasetelemetry.googleapis.com",
      );

      expect(res.updated).to.be.false;
      expect(res.key).to.deep.equal(key);
    });

    it("should do nothing if the service is already present in apiTargets", async () => {
      const key: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          apiTargets: [
            { service: "identitytoolkit.googleapis.com" },
            { service: "firebasetelemetry.googleapis.com" },
          ],
        },
      };

      nock(apiKeysOrigin())
        .get("/v2/keys:lookupKey")
        .query({ keyString: "AIzaSyFakeKeyString" })
        .reply(200, { name: key.name });

      nock(apiKeysOrigin())
        .get("/v2/projects/12345/locations/global/keys/abcd-1234")
        .reply(200, key);

      const res = await apikeys.ensureServiceInKeyRestrictions(
        "AIzaSyFakeKeyString",
        "firebasetelemetry.googleapis.com",
      );

      expect(res.updated).to.be.false;
      expect(res.key).to.deep.equal(key);
    });

    it("should append service and update key when apiTargets is restricted and missing the service", async () => {
      const existingKey: apikeys.Key = {
        name: "projects/12345/locations/global/keys/abcd-1234",
        displayName: "Browser key",
        restrictions: {
          apiTargets: [{ service: "identitytoolkit.googleapis.com" }],
        },
      };

      const updatedKey: apikeys.Key = {
        ...existingKey,
        restrictions: {
          apiTargets: [
            { service: "identitytoolkit.googleapis.com" },
            { service: "firebasetelemetry.googleapis.com" },
          ],
        },
      };

      nock(apiKeysOrigin())
        .get("/v2/keys:lookupKey")
        .query({ keyString: "AIzaSyFakeKeyString" })
        .reply(200, { name: existingKey.name });

      nock(apiKeysOrigin())
        .get("/v2/projects/12345/locations/global/keys/abcd-1234")
        .reply(200, existingKey);

      nock(apiKeysOrigin())
        .patch(
          "/v2/projects/12345/locations/global/keys/abcd-1234",
          (body: apikeys.Key) => {
            expect(body.restrictions?.apiTargets).to.deep.equal([
              { service: "identitytoolkit.googleapis.com" },
              { service: "firebasetelemetry.googleapis.com" },
            ]);
            return true;
          },
        )
        .query({ updateMask: "restrictions" })
        .reply(200, {
          name: "operations/op-123",
          done: true,
          response: updatedKey,
        });

      const res = await apikeys.ensureServiceInKeyRestrictions(
        "AIzaSyFakeKeyString",
        "firebasetelemetry.googleapis.com",
      );

      expect(res.updated).to.be.true;
      expect(res.key).to.deep.equal(updatedKey);
    });
  });

  describe("ensureServiceInProjectKeyRestrictions", () => {
    it("should update restricted keys missing the service and skip unrestricted/already-allowed keys", async () => {
      const unrestrictedKey: apikeys.Key = {
        name: "projects/test-project/locations/global/keys/key-1",
        displayName: "Unrestricted Key",
        restrictions: {},
      };
      const alreadyAllowedKey: apikeys.Key = {
        name: "projects/test-project/locations/global/keys/key-2",
        displayName: "Already Allowed Key",
        restrictions: {
          apiTargets: [{ service: "firebasetelemetry.googleapis.com" }],
        },
      };
      const restrictedKey: apikeys.Key = {
        name: "projects/test-project/locations/global/keys/key-3",
        displayName: "Restricted Key",
        restrictions: {
          apiTargets: [{ service: "identitytoolkit.googleapis.com" }],
        },
      };
      const updatedRestrictedKey: apikeys.Key = {
        ...restrictedKey,
        restrictions: {
          apiTargets: [
            { service: "identitytoolkit.googleapis.com" },
            { service: "firebasetelemetry.googleapis.com" },
          ],
        },
      };

      nock(apiKeysOrigin())
        .get("/v2/projects/test-project/locations/global/keys")
        .reply(200, { keys: [unrestrictedKey, alreadyAllowedKey, restrictedKey] });

      nock(apiKeysOrigin())
        .patch("/v2/projects/test-project/locations/global/keys/key-3")
        .query({ updateMask: "restrictions" })
        .reply(200, {
          name: "operations/op-123",
          done: true,
          response: updatedRestrictedKey,
        });

      const res = await apikeys.ensureServiceInProjectKeyRestrictions(
        "test-project",
        "firebasetelemetry.googleapis.com",
      );

      expect(res.updatedKeys).to.deep.equal([updatedRestrictedKey]);
      expect(res.unchangedKeys).to.deep.equal([unrestrictedKey, alreadyAllowedKey]);
    });
  });

  describe("updateProjectKeyRestrictions", () => {
    it("should apply updater function across all project keys", async () => {
      const key1: apikeys.Key = {
        name: "projects/test-project/locations/global/keys/key-1",
        displayName: "Key 1",
        restrictions: {
          browserKeyRestrictions: { allowedReferrers: ["https://old.example.com/*"] },
        },
      };
      const key2: apikeys.Key = {
        name: "projects/test-project/locations/global/keys/key-2",
        displayName: "Key 2",
        restrictions: {},
      };

      const updatedKey1: apikeys.Key = {
        ...key1,
        restrictions: {
          browserKeyRestrictions: { allowedReferrers: ["https://new.example.com/*"] },
        },
      };

      nock(apiKeysOrigin())
        .get("/v2/projects/test-project/locations/global/keys")
        .reply(200, { keys: [key1, key2] });

      nock(apiKeysOrigin())
        .patch("/v2/projects/test-project/locations/global/keys/key-1")
        .query({ updateMask: "restrictions" })
        .reply(200, {
          name: "operations/op-123",
          done: true,
          response: updatedKey1,
        });

      const res = await apikeys.updateProjectKeyRestrictions(
        "test-project",
        (restrictions, key) => {
          if (key.name === key1.name) {
            return {
              ...restrictions,
              browserKeyRestrictions: { allowedReferrers: ["https://new.example.com/*"] },
            };
          }
          return undefined; // Skip key2
        },
      );

      expect(res.updatedKeys).to.deep.equal([updatedKey1]);
      expect(res.unchangedKeys).to.deep.equal([key2]);
    });
  });
});
