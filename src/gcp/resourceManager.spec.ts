import { expect } from "chai";
import * as nock from "nock";
import { addServiceAccountToRoles, serviceAccountHasRoles } from "./resourceManager";
import { Policy } from "./iam";

const PROJECT_ID = "test-project";
const SERVICE_ACCOUNT_NAME = "test-sa";
const FULL_SA_NAME = `projects/${PROJECT_ID}/serviceAccounts/${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`;
const MEMBER_NAME = `serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`;

describe("resourceManager", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("addServiceAccountToRoles", () => {
    it("should add roles when skipAccountLookup is true", async () => {
      const initialPolicy: Policy = {
        bindings: [],
        etag: "etag",
        version: 1,
      };

      const expectedPolicy: Policy = {
        bindings: [
          {
            role: "roles/viewer",
            members: [MEMBER_NAME],
          },
        ],
        etag: "etag",
        version: 1,
      };

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:getIamPolicy`)
        .reply(200, initialPolicy);

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:setIamPolicy`, (body: any) => {
          return (
            body.updateMask === "bindings" &&
            JSON.stringify(body.policy) === JSON.stringify(expectedPolicy)
          );
        })
        .reply(200, expectedPolicy);

      const result = await addServiceAccountToRoles(
        PROJECT_ID,
        `${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`,
        ["roles/viewer"],
        true,
      );

      expect(result).to.deep.equal(expectedPolicy);
    });

    it("should add roles when skipAccountLookup is false", async () => {
      const initialPolicy: Policy = {
        bindings: [],
        etag: "etag",
        version: 1,
      };

      const expectedPolicy: Policy = {
        bindings: [
          {
            role: "roles/viewer",
            members: [MEMBER_NAME],
          },
        ],
        etag: "etag",
        version: 1,
      };

      nock("https://iam.googleapis.com")
        .get(
          `/v1/projects/${PROJECT_ID}/serviceAccounts/${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`,
        )
        .reply(200, { name: FULL_SA_NAME });

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:getIamPolicy`)
        .reply(200, initialPolicy);

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:setIamPolicy`, (body: any) => {
          return (
            body.updateMask === "bindings" &&
            JSON.stringify(body.policy) === JSON.stringify(expectedPolicy)
          );
        })
        .reply(200, expectedPolicy);

      const result = await addServiceAccountToRoles(
        PROJECT_ID,
        SERVICE_ACCOUNT_NAME,
        ["roles/viewer"],
        false,
      );

      expect(result).to.deep.equal(expectedPolicy);
    });

    it("should not duplicate roles if already present", async () => {
      const initialPolicy: Policy = {
        bindings: [
          {
            role: "roles/viewer",
            members: [MEMBER_NAME],
          },
        ],
        etag: "etag",
        version: 1,
      };

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:getIamPolicy`)
        .reply(200, initialPolicy);

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:setIamPolicy`, (body: any) => {
          return (
            body.updateMask === "bindings" &&
            JSON.stringify(body.policy) === JSON.stringify(initialPolicy)
          );
        })
        .reply(200, initialPolicy);

      const result = await addServiceAccountToRoles(
        PROJECT_ID,
        `${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`,
        ["roles/viewer"],
        true,
      );

      expect(result).to.deep.equal(initialPolicy);
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

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:getIamPolicy`)
        .reply(200, policy);

      const result = await serviceAccountHasRoles(
        PROJECT_ID,
        `${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`,
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

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:getIamPolicy`)
        .reply(200, policy);

      const result = await serviceAccountHasRoles(
        PROJECT_ID,
        `${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`,
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

      nock("https://cloudresourcemanager.googleapis.com")
        .post(`/v1/projects/${PROJECT_ID}:getIamPolicy`)
        .reply(200, policy);

      const result = await serviceAccountHasRoles(
        PROJECT_ID,
        `${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`,
        ["roles/viewer"],
        true,
      );

      expect(result).to.be.false;
    });
  });
});
