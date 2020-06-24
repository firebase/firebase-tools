import { expect } from "chai";
import * as nock from "nock";
import * as api from "../../api";
import { FirebaseError } from "../../error";

import * as rolesHelper from "../../extensions/rolesHelper";

const PROJECT_ID = "test-proj";
const INSTANCE_ID = "test-instance";
const TEST_ROLE = "test-role";
const TEST_ROLES = [{ role: TEST_ROLE, reason: "For testing." }];
const TEST_SERVICE_ACCOUNT_EMAIL = "test-email@test-proj.gserviceaccounts.com";

const IAM_VERSION = "v1";
const RESOURCEMANAGER_VERSION = "v1";

describe("createServiceAccountAndSetRoles", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should create a service account named ext-{instanceId} and set roles on it", async () => {
    nock(api.iamOrigin)
      .post(`/${IAM_VERSION}/projects/${PROJECT_ID}/serviceAccounts`)
      .reply(200, { email: TEST_SERVICE_ACCOUNT_EMAIL });
    nock(api.resourceManagerOrigin)
      .post(`/${RESOURCEMANAGER_VERSION}/projects/${PROJECT_ID}/:getIamPolicy`)
      .reply(200, {
        bindings: [{ role: "roles/existingRole", members: ["serviceAccount:blah@a.com"] }],
        version: 3,
      });
    nock(api.resourceManagerOrigin)
      .post(`/${RESOURCEMANAGER_VERSION}/projects/${PROJECT_ID}/:setIamPolicy`, {
        policy: {
          bindings: [
            { role: "roles/existingRole", members: ["serviceAccount:blah@a.com"] },
            {
              role: "roles/test-role",
              members: [`serviceAccount:${TEST_SERVICE_ACCOUNT_EMAIL}`],
            },
          ],
          version: 3,
        },
      })
      .reply(200);

    const serviceAccount = await rolesHelper.createServiceAccountAndSetRoles(
      PROJECT_ID,
      TEST_ROLES,
      INSTANCE_ID
    );
    expect(serviceAccount).to.be.equal(TEST_SERVICE_ACCOUNT_EMAIL);
    expect(nock.isDone());
  });

  it("should return a Firebase error if the accountId already exists", async () => {
    nock(api.iamOrigin)
      .post(`/${IAM_VERSION}/projects/${PROJECT_ID}/serviceAccounts`)
      .reply(409);

    await expect(
      rolesHelper.createServiceAccountAndSetRoles(PROJECT_ID, TEST_ROLES, INSTANCE_ID)
    ).to.be.rejectedWith(
      FirebaseError,
      "A service account ext-test-instance already exists in project test-proj. " +
        "Please delete it or choose a different extension instance id."
    );
  });

  it("should throw the caught error if its status is not 409", async () => {
    nock(api.iamOrigin)
      .post(`/${IAM_VERSION}/projects/${PROJECT_ID}/serviceAccounts`)
      .reply(500);
    await expect(
      rolesHelper.createServiceAccountAndSetRoles(PROJECT_ID, TEST_ROLES, INSTANCE_ID)
    ).to.be.rejectedWith(FirebaseError, "HTTP Error: 500, Unknown Error");
  });
});

describe("grantRoles", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should add the desired roles to the service account, and not remove existing roles", async () => {
    nock(api.resourceManagerOrigin)
      .post(`/${RESOURCEMANAGER_VERSION}/projects/${PROJECT_ID}/:getIamPolicy`)
      .reply(200, {
        bindings: [{ role: "roles/test", members: ["serviceAccount:me@me.com"] }],
        version: 3,
      });
    const rolesToAdd = ["cool.role.create", "cool.role.delete"];
    const expectedBody = {
      policy: {
        bindings: [
          { role: "roles/test", members: ["serviceAccount:me@me.com"] },
          {
            role: "roles/cool.role.create",
            members: [`serviceAccount:${TEST_SERVICE_ACCOUNT_EMAIL}`],
          },
          {
            role: "roles/cool.role.delete",
            members: [`serviceAccount:${TEST_SERVICE_ACCOUNT_EMAIL}`],
          },
        ],
        version: 3,
      },
    };
    nock(api.resourceManagerOrigin)
      .post(`/${RESOURCEMANAGER_VERSION}/projects/${PROJECT_ID}/:setIamPolicy`, expectedBody)
      .reply(200);

    await rolesHelper.grantRoles(PROJECT_ID, TEST_SERVICE_ACCOUNT_EMAIL, rolesToAdd, []);

    expect(nock.isDone()).to.be.true;
  });

  it("should remove the chosen service account from the bindings for each roleToRemove", async () => {
    nock(api.resourceManagerOrigin)
      .post(`/${RESOURCEMANAGER_VERSION}/projects/${PROJECT_ID}/:getIamPolicy`)
      .reply(200, {
        bindings: [
          {
            role: "roles/test",
            members: ["serviceAccount:me@me.com", `serviceAccount:${TEST_SERVICE_ACCOUNT_EMAIL}`],
          },
        ],
        version: 3,
      });
    const rolesToRemove = ["test"];
    const expectedBody = {
      policy: {
        bindings: [{ role: "roles/test", members: ["serviceAccount:me@me.com"] }],
        version: 3,
      },
    };
    nock(api.resourceManagerOrigin)
      .post(`/${RESOURCEMANAGER_VERSION}/projects/${PROJECT_ID}/:setIamPolicy`, expectedBody)
      .reply(200);

    await rolesHelper.grantRoles(PROJECT_ID, TEST_SERVICE_ACCOUNT_EMAIL, [], rolesToRemove);

    expect(nock.isDone()).to.be.true;
  });
});
