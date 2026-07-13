import { expect } from "chai";
import nock from "../test/helpers/nock";

import { resourceManagerOrigin } from "../api";
import * as iam from "./iam";

const BINDING = {
  role: "some/role",
  members: ["someuser"],
};

describe("iam", () => {
  describe("mergeBindings", () => {
    it("should not update the policy when the bindings are present", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      };

      const updated = iam.mergeBindings(policy, [BINDING]);

      expect(updated).to.be.false;
      expect(policy.bindings).to.deep.equal([BINDING]);
    });

    it("should update the members of a binding in the policy", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      };

      const updated = iam.mergeBindings(policy, [{ role: "some/role", members: ["newuser"] }]);

      expect(updated).to.be.true;
      expect(policy.bindings).to.deep.equal([
        {
          role: "some/role",
          members: ["someuser", "newuser"],
        },
      ]);
    });

    it("should add a new binding to the policy", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [],
      };

      const updated = iam.mergeBindings(policy, [BINDING]);

      expect(updated).to.be.true;
      expect(policy.bindings).to.deep.equal([BINDING]);
    });
  });

  describe("testIamPermissions", () => {
    const tests: {
      desc: string;
      permissionsToCheck: string[];
      permissionsToReturn: string[];
      wantAllowedPermissions: string[];
      wantMissingPermissions?: string[];
      wantedPassed: boolean;
    }[] = [
      {
        desc: "should pass if we have all permissions",
        permissionsToCheck: ["foo", "bar"],
        permissionsToReturn: ["foo", "bar"],
        wantAllowedPermissions: ["foo", "bar"].sort(),
        wantedPassed: true,
      },
      {
        desc: "should fail if we don't have all permissions",
        permissionsToCheck: ["foo", "bar"],
        permissionsToReturn: ["foo"],
        wantAllowedPermissions: ["foo"].sort(),
        wantMissingPermissions: ["bar"].sort(),
        wantedPassed: false,
      },
    ];

    for (const t of tests) {
      it(t.desc, async () => {
        nock(resourceManagerOrigin())
          .post(`/v1/projects/foo:testIamPermissions`)
          .matchHeader("x-goog-user-project", "foo")
          .reply(200, { permissions: t.permissionsToReturn });

        const res = await iam.testIamPermissions("foo", t.permissionsToCheck);

        expect(res.allowed).to.deep.equal(t.wantAllowedPermissions);
        expect(res.missing).to.deep.equal(t.wantMissingPermissions || []);
        expect(res.passed).to.equal(t.wantedPassed);

        expect(nock.isDone()).to.be.true;
      });
    }
  });

  describe("service account management", () => {
    const PROJECT_ID = "test-project";
    const ACCOUNT_ID = "test-account";
    const EMAIL = `${ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com`;
    const DISPLAY_NAME = "Test Account";
    const DESCRIPTION = "Test Description";

    afterEach(() => {
      nock.cleanAll();
    });

    describe("createServiceAccount", () => {
      it("should create a service account", async () => {
        nock("https://iam.googleapis.com")
          .post(`/v1/projects/${PROJECT_ID}/serviceAccounts`, {
            accountId: ACCOUNT_ID,
            serviceAccount: {
              displayName: DISPLAY_NAME,
              description: DESCRIPTION,
            },
          })
          .reply(200, {
            name: `projects/${PROJECT_ID}/serviceAccounts/${EMAIL}`,
            projectId: PROJECT_ID,
            uniqueId: "123",
            email: EMAIL,
            displayName: DISPLAY_NAME,
            description: DESCRIPTION,
          });

        const account = await iam.createServiceAccount(
          PROJECT_ID,
          ACCOUNT_ID,
          DESCRIPTION,
          DISPLAY_NAME,
        );

        expect(account).to.deep.include({
          projectId: PROJECT_ID,
          email: EMAIL,
          displayName: DISPLAY_NAME,
        });
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("getServiceAccount", () => {
      it("should get a service account", async () => {
        nock("https://iam.googleapis.com")
          .get(`/v1/projects/${PROJECT_ID}/serviceAccounts/${EMAIL}`)
          .reply(200, {
            name: `projects/${PROJECT_ID}/serviceAccounts/${EMAIL}`,
            email: EMAIL,
          });

        const account = await iam.getServiceAccount(PROJECT_ID, ACCOUNT_ID);

        expect(account.email).to.equal(EMAIL);
        expect(nock.isDone()).to.be.true;
      });

      it("should get a service account when passed a full email address", async () => {
        nock("https://iam.googleapis.com")
          .get(`/v1/projects/${PROJECT_ID}/serviceAccounts/${EMAIL}`)
          .reply(200, {
            name: `projects/${PROJECT_ID}/serviceAccounts/${EMAIL}`,
            email: EMAIL,
          });

        const account = await iam.getServiceAccount(PROJECT_ID, EMAIL);

        expect(account.email).to.equal(EMAIL);
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("createServiceAccountKey", () => {
      it("should create a service account key", async () => {
        nock("https://iam.googleapis.com")
          .post(`/v1/projects/${PROJECT_ID}/serviceAccounts/${EMAIL}/keys`, {
            keyAlgorithm: "KEY_ALG_UNSPECIFIED",
            privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
          })
          .reply(200, {
            name: "key-name",
            privateKeyData: "data",
          });

        const key = await iam.createServiceAccountKey(PROJECT_ID, ACCOUNT_ID);

        expect(key.name).to.equal("key-name");
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("deleteServiceAccount", () => {
      it("should delete a service account", async () => {
        nock("https://iam.googleapis.com")
          .delete(`/v1/projects/${PROJECT_ID}/serviceAccounts/${EMAIL}`)
          .reply(200, {});

        await iam.deleteServiceAccount(PROJECT_ID, EMAIL);

        expect(nock.isDone()).to.be.true;
      });

      it("should not throw if deleting a non-existent service account", async () => {
        nock("https://iam.googleapis.com")
          .delete(`/v1/projects/${PROJECT_ID}/serviceAccounts/${EMAIL}`)
          .reply(404);

        await iam.deleteServiceAccount(PROJECT_ID, EMAIL);

        expect(nock.isDone()).to.be.true;
      });
    });

    describe("listServiceAccountKeys", () => {
      it("should list service account keys", async () => {
        nock("https://iam.googleapis.com")
          .get(`/v1/projects/${PROJECT_ID}/serviceAccounts/${EMAIL}/keys`)
          .reply(200, {
            keys: [{ name: "key1" }, { name: "key2" }],
          });

        const keys = await iam.listServiceAccountKeys(PROJECT_ID, ACCOUNT_ID);

        expect(keys).to.have.lengthOf(2);
        expect(keys[0].name).to.equal("key1");
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("getRole", () => {
      it("should get a role", async () => {
        const ROLE_NAME = "roles/viewer";
        nock("https://iam.googleapis.com").get(`/v1/roles/${ROLE_NAME}`).reply(200, {
          name: ROLE_NAME,
          title: "Viewer",
        });

        const role = await iam.getRole(ROLE_NAME);

        expect(role.name).to.equal(ROLE_NAME);
        expect(role.title).to.equal("Viewer");
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("getRoleName", () => {
      it("should return human readable title from known roles map", async () => {
        const name = await iam.getRoleName("roles/bigquery.dataEditor");

        expect(name).to.equal("BigQuery Data Editor");
      });

      it("should fall back to getRole API for unknown roles", async () => {
        nock("https://iam.googleapis.com")
          .get("/v1/roles/roles/customRole")
          .reply(200, { name: "roles/customRole", title: "My Custom Role" });

        const name = await iam.getRoleName("roles/customRole");
        expect(name).to.equal("My Custom Role");
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("generateManagedServiceAccountName", () => {
      it("should return first account Id if it does not exist (404)", async () => {
        nock("https://iam.googleapis.com")
          .get(new RegExp(`/v1/projects/${PROJECT_ID}/serviceAccounts/firebase-fn-.*`))
          .reply(404);

        const name = await iam.generateManagedServiceAccountName(PROJECT_ID, "firebase-fn");
        expect(name).to.match(/^firebase-fn-\d{10}$/);
        expect(nock.isDone()).to.be.true;
      });
    });
  });
});
