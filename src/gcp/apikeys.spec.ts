import { expect } from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";

import { Key } from "./apikeys";
import * as apikeys from "./apikeys";
import { apiKeysOrigin } from "../api";
import * as operationPoller from "../operation-poller";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";
const TEST_KEY_RESOURCE_NAME = `projects/${PROJECT_ID}/locations/global/keys/test-key`;
const LOOKUP_KEYS_PATH = "/v2/keys:lookupKey";

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

  describe("updateAppApiKeyRestriction", () => {
    const apiKeyString = "AIzaSyFakeKeyString";
    const serviceName = "testservice.googleapis.com";

    const TEST_KEY_PATH = `/v2/${TEST_KEY_RESOURCE_NAME}`;

    it("should not patch an unrestricted key with empty restrictions", async () => {
      const emptyRestrictionsKey: Key = {
        name: TEST_KEY_RESOURCE_NAME,
        displayName: "Empty Restrictions Key",
        restrictions: {},
      };

      nock(apiKeysOrigin())
        .get(LOOKUP_KEYS_PATH)
        .query({ keyString: apiKeyString })
        .reply(200, { name: TEST_KEY_RESOURCE_NAME });

      nock(apiKeysOrigin()).get(TEST_KEY_PATH).reply(200, emptyRestrictionsKey);

      const patchReq = nock(apiKeysOrigin()).patch(TEST_KEY_PATH).reply(200);

      await apikeys.updateAppApiKeyRestriction({ apiKey: apiKeyString, service: serviceName });

      expect(patchReq.isDone()).to.be.false;
    });

    it("should not patch an unrestricted key with empty apiTargets", async () => {
      const emptyApiTargetsKey: Key = {
        name: TEST_KEY_RESOURCE_NAME,
        displayName: "Empty apiTargets Key",
        restrictions: {
          apiTargets: [],
        },
      };

      nock(apiKeysOrigin())
        .get(LOOKUP_KEYS_PATH)
        .query({ keyString: apiKeyString })
        .reply(200, { name: TEST_KEY_RESOURCE_NAME });

      nock(apiKeysOrigin()).get(TEST_KEY_PATH).reply(200, emptyApiTargetsKey);

      const patchReq = nock(apiKeysOrigin()).patch(TEST_KEY_PATH).reply(200);

      await apikeys.updateAppApiKeyRestriction({ apiKey: apiKeyString, service: serviceName });

      expect(patchReq.isDone()).to.be.false;
    });

    it("should not patch a restricted already allowed key", async () => {
      const restrictedAlreadyAllowedKey: Key = {
        name: TEST_KEY_RESOURCE_NAME,
        displayName: "Already Allowed Key",
        restrictions: {
          apiTargets: [{ service: serviceName }],
        },
      };

      nock(apiKeysOrigin())
        .get(LOOKUP_KEYS_PATH)
        .query({ keyString: apiKeyString })
        .reply(200, { name: TEST_KEY_RESOURCE_NAME });

      nock(apiKeysOrigin()).get(TEST_KEY_PATH).reply(200, restrictedAlreadyAllowedKey);

      const patchReq = nock(apiKeysOrigin()).patch(TEST_KEY_PATH).reply(200);

      await apikeys.updateAppApiKeyRestriction({ apiKey: apiKeyString, service: serviceName });

      expect(patchReq.isDone()).to.be.false;
    });

    it("should patch a restricted key to include the missing service restriction with polling", async () => {
      const existingServiceName = "existingservice.googleapis.com";
      const restrictedMissingKey: Key = {
        name: TEST_KEY_RESOURCE_NAME,
        displayName: "Restricted Key",
        restrictions: {
          apiTargets: [{ service: existingServiceName }],
        },
      };

      nock(apiKeysOrigin())
        .get(LOOKUP_KEYS_PATH)
        .query({ keyString: apiKeyString })
        .reply(200, { name: TEST_KEY_RESOURCE_NAME });

      nock(apiKeysOrigin()).get(TEST_KEY_PATH).reply(200, restrictedMissingKey);

      const patchReq = nock(apiKeysOrigin())
        .patch(TEST_KEY_PATH, (body: Key) => {
          expect(body.restrictions?.apiTargets).to.deep.equal([
            { service: existingServiceName },
            { service: serviceName },
          ]);
          return true;
        })
        .query({ updateMask: "restrictions" })
        .reply(200, { name: "operations/op-123" });

      const pollStub = sandbox.stub(operationPoller, "pollOperation").resolves();

      await apikeys.updateAppApiKeyRestriction({ apiKey: apiKeyString, service: serviceName });
      expect(patchReq.isDone()).to.be.true;
      expect(pollStub).to.have.been.calledWith({
        apiOrigin: apiKeysOrigin(),
        apiVersion: "v2",
        operationResourceName: "operations/op-123",
      });
    });

    it("should throw FirebaseError when lookup API returns 403", async () => {
      nock(apiKeysOrigin())
        .get(LOOKUP_KEYS_PATH)
        .query({ keyString: apiKeyString })
        .reply(403, { error: { message: "Permission denied" } });

      await expect(
        apikeys.updateAppApiKeyRestriction({ apiKey: apiKeyString, service: serviceName }),
      ).to.be.rejectedWith(FirebaseError, /Permission denied when looking up API key/);
    });

    it("should throw FirebaseError with key resource name when getKeyWithResourceName API returns 403", async () => {
      nock(apiKeysOrigin())
        .get(LOOKUP_KEYS_PATH)
        .query({ keyString: apiKeyString })
        .reply(200, { name: TEST_KEY_RESOURCE_NAME });

      nock(apiKeysOrigin())
        .get(TEST_KEY_PATH)
        .reply(403, { error: { message: "Permission denied" } });

      await expect(
        apikeys.updateAppApiKeyRestriction({ apiKey: apiKeyString, service: serviceName }),
      ).to.be.rejectedWith(
        FirebaseError,
        /Permission denied when retrieving API key projects\/test-project\/locations\/global\/keys\/test-key/,
      );
    });

    it("should throw FirebaseError with key display name when updateKey API returns 403", async () => {
      const existingServiceName = "existingservice.googleapis.com";
      const restrictedMissingKey: Key = {
        name: TEST_KEY_RESOURCE_NAME,
        displayName: "Restricted Key",
        restrictions: {
          apiTargets: [{ service: existingServiceName }],
        },
      };

      nock(apiKeysOrigin())
        .get(LOOKUP_KEYS_PATH)
        .query({ keyString: apiKeyString })
        .reply(200, { name: TEST_KEY_RESOURCE_NAME });

      nock(apiKeysOrigin()).get(TEST_KEY_PATH).reply(200, restrictedMissingKey);

      nock(apiKeysOrigin())
        .patch(TEST_KEY_PATH)
        .query({ updateMask: "restrictions" })
        .reply(403, { error: { message: "Permission denied" } });

      await expect(
        apikeys.updateAppApiKeyRestriction({ apiKey: apiKeyString, service: serviceName }),
      ).to.be.rejectedWith(FirebaseError, /Permission denied when updating API key Restricted Key/);
    });
  });
});
