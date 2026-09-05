import * as sinon from "sinon";
import { expect } from "chai";

import { resourceManagerOrigin } from "../api";
import nock from "../test/helpers/nock";
import * as utils from "../utils";
import {
  addServiceAccountToRoles,
  serviceAccountHasRoles,
  removeServiceAccountRoles,
  getServiceAccountRoles,
} from "./resourceManager";

import { Policy } from "./iam";

const PROJECT_ID = "test-project";
const SERVICE_ACCOUNT_NAME = "test-sa";
const SA_EMAIL = `${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`;
const FULL_SA_NAME = `projects/${PROJECT_ID}/serviceAccounts/${SA_EMAIL}`;
const MEMBER_NAME = `serviceAccount:${SA_EMAIL}`;

const EMPTY_POLICY: Policy = {
  bindings: [],
  etag: "etag",
  version: 1,
};

const VIEWER_POLICY: Policy = {
  bindings: [
    {
      role: "roles/viewer",
      members: [MEMBER_NAME],
    },
  ],
  etag: "etag",
  version: 1,
};

function mockGetIamPolicy(policy: Policy = EMPTY_POLICY, projectId = PROJECT_ID): void {
  nock(resourceManagerOrigin()).post(`/v1/projects/${projectId}:getIamPolicy`).reply(200, policy);
}

function mockSetIamPolicy(
  status: number,
  response: Policy | Record<string, unknown>,
  expectedPolicy?: Policy,
  projectId = PROJECT_ID,
): void {
  nock(resourceManagerOrigin())
    .post(
      `/v1/projects/${projectId}:setIamPolicy`,
      expectedPolicy
        ? (body: { updateMask?: string; policy?: Policy }) =>
            body.updateMask === "bindings" &&
            JSON.stringify(body.policy) === JSON.stringify(expectedPolicy)
        : undefined,
    )
    .reply(status, response);
}

describe("resourceManager", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("addServiceAccountToRoles", () => {
    const origRetryWithBackoff = utils.retryWithBackoff;
    let retryStub: sinon.SinonStub;

    beforeEach(() => {
      retryStub = sinon
        .stub(utils, "retryWithBackoff")
        .callsFake((fn, opts) => origRetryWithBackoff(fn, { ...opts, delay: 1, maxDelay: 5 }));
    });

    afterEach(() => {
      retryStub.restore();
    });
    it("should add roles when skipAccountLookup is true", async () => {
      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(200, VIEWER_POLICY, VIEWER_POLICY);

      const result = await addServiceAccountToRoles(PROJECT_ID, SA_EMAIL, ["roles/viewer"], true);

      expect(result).to.deep.equal(VIEWER_POLICY);
    });

    it("should add roles when skipAccountLookup is false", async () => {
      nock("https://iam.googleapis.com")
        .get(`/v1/projects/${PROJECT_ID}/serviceAccounts/${SA_EMAIL}`)
        .reply(200, { name: FULL_SA_NAME });

      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(200, VIEWER_POLICY, VIEWER_POLICY);

      const result = await addServiceAccountToRoles(
        PROJECT_ID,
        SERVICE_ACCOUNT_NAME,
        ["roles/viewer"],
        false,
      );

      expect(result).to.deep.equal(VIEWER_POLICY);
    });

    it("should not duplicate roles if already present", async () => {
      mockGetIamPolicy(VIEWER_POLICY);
      mockSetIamPolicy(200, VIEWER_POLICY, VIEWER_POLICY);

      const result = await addServiceAccountToRoles(PROJECT_ID, SA_EMAIL, ["roles/viewer"], true);

      expect(result).to.deep.equal(VIEWER_POLICY);
    });

    it("should retry and succeed when setIamPolicy initially fails with 400 'does not exist' error", async () => {
      const expectedPolicy = { ...VIEWER_POLICY, etag: "etag2" };

      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(400, {
        error: {
          code: 400,
          message: `Service account ${SA_EMAIL} does not exist.`,
          status: "INVALID_ARGUMENT",
        },
      });
      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(200, expectedPolicy);

      const result = await addServiceAccountToRoles(PROJECT_ID, SA_EMAIL, ["roles/viewer"], true);

      expect(result).to.deep.equal(expectedPolicy);
    });

    it("should retry and succeed when setIamPolicy initially fails with 409 conflict", async () => {
      const expectedPolicy = { ...VIEWER_POLICY, etag: "etag2" };

      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(409, {
        error: {
          code: 409,
          message: "There were concurrent policy changes.",
          status: "ABORTED",
        },
      });
      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(200, expectedPolicy);

      const result = await addServiceAccountToRoles(PROJECT_ID, SA_EMAIL, ["roles/viewer"], true);

      expect(result).to.deep.equal(expectedPolicy);
    });

    it("should fail immediately on 403 permission error without retrying", async () => {
      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(403, {
        error: {
          code: 403,
          message: "The caller does not have permission",
          status: "PERMISSION_DENIED",
        },
      });

      await expect(addServiceAccountToRoles(PROJECT_ID, SA_EMAIL, ["roles/viewer"], true)).to.be
        .rejected;
    });

    it("should fail immediately on 404 not found error without retrying", async () => {
      mockGetIamPolicy(EMPTY_POLICY);
      mockSetIamPolicy(404, {
        error: {
          code: 404,
          message: "Project does not exist",
          status: "NOT_FOUND",
        },
      });

      await expect(addServiceAccountToRoles(PROJECT_ID, SA_EMAIL, ["roles/viewer"], true)).to.be
        .rejected;
    });
  });

  describe("serviceAccountHasRoles", () => {
    it("should return true if account has all roles", async () => {
      const policy: Policy = {
        bindings: [
          {
            role: "roles/viewer",
            members: [MEMBER_NAME],
          },
          {
            role: "roles/editor",
            members: [MEMBER_NAME],
          },
        ],
        etag: "etag",
        version: 1,
      };

      mockGetIamPolicy(policy);

      const result = await serviceAccountHasRoles(
        PROJECT_ID,
        SA_EMAIL,
        ["roles/viewer", "roles/editor"],
        true,
      );

      expect(result).to.be.true;
    });

    it("should return false if account is missing a role", async () => {
      const policy: Policy = {
        bindings: [
          {
            role: "roles/viewer",
            members: [MEMBER_NAME],
          },
        ],
        etag: "etag",
        version: 1,
      };

      mockGetIamPolicy(policy);

      const result = await serviceAccountHasRoles(
        PROJECT_ID,
        SA_EMAIL,
        ["roles/viewer", "roles/editor"],
        true,
      );

      expect(result).to.be.false;
    });

    it("should return false if role exists but member is missing", async () => {
      const policy: Policy = {
        bindings: [
          {
            role: "roles/viewer",
            members: ["serviceAccount:other@example.com"],
          },
        ],
        etag: "etag",
        version: 1,
      };

      mockGetIamPolicy(policy);

      const result = await serviceAccountHasRoles(PROJECT_ID, SA_EMAIL, ["roles/viewer"], true);

      expect(result).to.be.false;
    });
  });

  describe("removeServiceAccountRoles", () => {
    it("should remove specified roles from the service account", async () => {
      const initialPolicy: Policy = {
        bindings: [
          { role: "roles/viewer", members: [MEMBER_NAME, "user:other"] },
          { role: "roles/editor", members: [MEMBER_NAME] },
        ],
        etag: "etag",
        version: 1,
      };

      const expectedPolicy: Policy = {
        bindings: [{ role: "roles/viewer", members: ["user:other"] }],
        etag: "etag",
        version: 1,
      };

      mockGetIamPolicy(initialPolicy);
      mockSetIamPolicy(200, expectedPolicy, expectedPolicy);

      const result = await removeServiceAccountRoles(PROJECT_ID, SA_EMAIL, [
        "roles/viewer",
        "roles/editor",
      ]);

      expect(result).to.deep.equal(expectedPolicy);
    });
  });

  describe("getServiceAccountRoles", () => {
    it("should extract roles for the given service account", async () => {
      const policy: Policy = {
        bindings: [
          { role: "roles/role1", members: [MEMBER_NAME] },
          { role: "roles/role2", members: ["user:other"] },
          { role: "roles/role3", members: [MEMBER_NAME, "user:other"] },
        ],
        etag: "etag",
        version: 1,
      };

      mockGetIamPolicy(policy);

      const roles = await getServiceAccountRoles(PROJECT_ID, SA_EMAIL);
      expect(roles).to.deep.equal(["roles/role1", "roles/role3"]);
    });
  });
});
