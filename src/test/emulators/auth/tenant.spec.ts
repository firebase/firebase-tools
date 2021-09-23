import { expect } from "chai";
import { Tenant } from "../../../emulator/auth/state";
import { expectStatusCode, registerTenant } from "./helpers";
import { describeAuthEmulator } from "./setup";

describeAuthEmulator("tenant management", ({ authApi, getClock }) => {
  describe("createTenant", () => {
    it("should create tenants", async () => {
      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/projects/project-id/tenants")
        .set("Authorization", "Bearer owner")
        .send({
          allowPasswordSignup: true,
          disableAuth: false,
          displayName: "display",
          enableAnonymousUser: true,
          enableEmailLinkSignin: true,
          mfaConfig: {
            enabledProviders: ["PROVIDER_UNSPECIFIED", "PHONE_SMS"],
            state: "ENABLED",
          },
          testPhoneNumbers: { "1234567890": "fake-code", "1(555)555-5555": "another-fake-code" },
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.allowPasswordSignup).to.be.true;
          expect(res.body.disableAuth).to.be.false;
          expect(res.body.displayName).to.eql("display");
          expect(res.body.enableAnonymousUser).to.be.true;
          expect(res.body.enableEmailLinkSignin).to.be.true;
          expect(res.body.mfaConfig).to.eql({
            enabledProviders: ["PROVIDER_UNSPECIFIED", "PHONE_SMS"],
            state: "ENABLED",
          });
          expect(res.body.testPhoneNumbers).to.eql({
            "+1234567890": "fake-code",
            "+15555555555": "another-fake-code",
          });

          // Should have a non-empty tenantId and matching resource name
          expect(res.body).to.have.property("tenantId");
          expect(res.body.tenantId).to.not.eql("");
          expect(res.body).to.have.property("name");
          expect(res.body.name).to.eql(`projects/project-id/tenants/${res.body.tenantId}`);
        });
    });

    it("should error for too long phone number strings", async () => {
      const stringOfLength251 =
        "26309807635151999007190279164688762548403557194653647493992467370002025938089183725458712376845251478037398883690369019457887385561469910485467169892025615975626596228774429150543679701729000472697539159978901659121833328943611034838868161513522457664";
      const testPhoneNumbers: { [key: string]: string } = {};
      testPhoneNumbers[stringOfLength251] = "fake-code";

      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/projects/project-id/tenants")
        .set("Authorization", "Bearer owner")
        .send({
          testPhoneNumbers,
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("TOO_LONG");
        });
    });

    it("should error for invalid phone numbers", async () => {
      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/projects/project-id/tenants")
        .set("Authorization", "Bearer owner")
        .send({
          testPhoneNumbers: { "+++++++[][][][][]": "fake-code" },
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("INVALID_PHONE_NUMBER");
        });
    });

    it("should error for too short phone numbers", async () => {
      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/projects/project-id/tenants")
        .set("Authorization", "Bearer owner")
        .send({
          testPhoneNumbers: { "1": "fake-code" },
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("INVALID_PHONE_NUMBER");
        });
    });

    it("should error for too long phone numbers", async () => {
      const stringOfLength18 = "801865849451122371";
      const testPhoneNumbers: { [key: string]: string } = {};
      testPhoneNumbers[stringOfLength18] = "fake-code";

      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/projects/project-id/tenants")
        .set("Authorization", "Bearer owner")
        .send({
          testPhoneNumbers,
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("TOO_LONG");
        });
    });
  });

  describe("getTenants", () => {
    it("should get tenants", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});

      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`)
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.eql(tenant);
        });
    });

    it("should error for tenants that do not exist", async () => {
      await authApi()
        .get("/identitytoolkit.googleapis.com/v2/projects/project-id/tenants/not-found-tenant-id")
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("TENANT_NOT_FOUND");
        });
    });
  });

  describe("deleteTenants", () => {
    it("should delete tenants", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});

      await authApi()
        .delete(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`
        )
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(200, res);
        });
    });

    it("should error for tenants that do not exist", async () => {
      await authApi()
        .delete(
          "/identitytoolkit.googleapis.com/v2/projects/project-id/tenants/not-found-tenant-id"
        )
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.include("TENANT_NOT_FOUND");
        });
    });
  });

  describe("listTenants", () => {
    it("should list tenants", async () => {
      const projectId = "project-id";
      const tenant1 = await registerTenant(authApi(), projectId, {});
      const tenant2 = await registerTenant(authApi(), projectId, {});

      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.tenants).to.have.length(2);
          expect(res.body.tenants.map((tenant: Tenant) => tenant.tenantId)).to.have.members([
            tenant1.tenantId,
            tenant2.tenantId,
          ]);
          expect(res.body).not.to.have.property("nextPageToken");
        });
    });

    it("should allow specifying pageSize and pageToken", async () => {
      const projectId = "project-id";
      const tenant1 = await registerTenant(authApi(), projectId, {});
      const tenant2 = await registerTenant(authApi(), projectId, {});
      const tenantIds = [tenant1.tenantId, tenant2.tenantId].sort();

      const nextPageToken = await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
        .set("Authorization", "Bearer owner")
        .query({ pageSize: 1 })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.tenants).to.have.length(1);
          expect(res.body.tenants[0].tenantId).to.eql(tenantIds[0]);
          expect(res.body).to.have.property("nextPageToken").which.is.a("string");
          return res.body.nextPageToken;
        });

      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
        .set("Authorization", "Bearer owner")
        .query({ pageToken: nextPageToken })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.tenants).to.have.length(1);
          expect(res.body.tenants[0].tenantId).to.eql(tenantIds[1]);
          expect(res.body).not.to.have.property("nextPageToken");
        });
    });

    it("should always return a page token even if page is full", async () => {
      const projectId = "project-id";
      const tenant1 = await registerTenant(authApi(), projectId, {});
      const tenant2 = await registerTenant(authApi(), projectId, {});
      const tenantIds = [tenant1.tenantId, tenant2.tenantId].sort();

      const nextPageToken = await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
        .set("Authorization", "Bearer owner")
        .query({ pageSize: 2 })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.tenants).to.have.length(2);
          expect(res.body.tenants[0].tenantId).to.eql(tenantIds[0]);
          expect(res.body.tenants[1].tenantId).to.eql(tenantIds[1]);
          expect(res.body).to.have.property("nextPageToken").which.is.a("string");
          return res.body.nextPageToken;
        });

      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
        .set("Authorization", "Bearer owner")
        .query({ pageToken: nextPageToken })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.tenants || []).to.have.length(0);
          expect(res.body).not.to.have.property("nextPageToken");
        });
    });
  });

  describe("updateTenants", () => {
    it("updates tenant config", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});
      const updateMask =
        "allowPasswordSignup,disableAuth,displayName,enableAnonymousUser,enableEmailLinkSignin,mfaConfig,testPhoneNumbers";

      await authApi()
        .patch(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`
        )
        .set("Authorization", "Bearer owner")
        .query({ updateMask })
        .send({
          allowPasswordSignup: true,
          disableAuth: false,
          displayName: "display",
          enableAnonymousUser: true,
          enableEmailLinkSignin: true,
          mfaConfig: {
            enabledProviders: ["PROVIDER_UNSPECIFIED", "PHONE_SMS"],
            state: "ENABLED",
          },
          testPhoneNumbers: { "1234567890": "fake-code", "1(555)555-5555": "another-fake-code" },
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.allowPasswordSignup).to.be.true;
          expect(res.body.disableAuth).to.be.false;
          expect(res.body.displayName).to.eql("display");
          expect(res.body.enableAnonymousUser).to.be.true;
          expect(res.body.enableEmailLinkSignin).to.be.true;
          expect(res.body.mfaConfig).to.eql({
            enabledProviders: ["PROVIDER_UNSPECIFIED", "PHONE_SMS"],
            state: "ENABLED",
          });
          expect(res.body.testPhoneNumbers).to.eql({
            "+1234567890": "fake-code",
            "+15555555555": "another-fake-code",
          });
        });
    });

    it("does not update if the field does not exist on the update tenant", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});
      const updateMask = "displayName";

      await authApi()
        .patch(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`
        )
        .set("Authorization", "Bearer owner")
        .query({ updateMask })
        .send({})
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("displayName");
        });
    });

    it("does not update if indexing a primitive field or array on the update tenant", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {
        displayName: "display",
        mfaConfig: {
          enabledProviders: ["PROVIDER_UNSPECIFIED", "PHONE_SMS"],
        },
      });
      const updateMask = "displayName.0,mfaConfig.enabledProviders.nonexistentField";

      await authApi()
        .patch(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`
        )
        .set("Authorization", "Bearer owner")
        .query({ updateMask })
        .send({
          displayName: "unused",
          mfaConfig: {
            enabledProviders: ["PROVIDER_UNSPECIFIED"],
          },
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.displayName).to.eql("display");
          expect(res.body.mfaConfig.enabledProviders).to.eql(["PROVIDER_UNSPECIFIED", "PHONE_SMS"]);
        });
    });

    it("performs a full update if the update mask is empty", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});

      await authApi()
        .patch(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`
        )
        .set("Authorization", "Bearer owner")
        .send({
          allowPasswordSignup: true,
          disableAuth: false,
          displayName: "display",
          enableAnonymousUser: true,
          enableEmailLinkSignin: true,
          mfaConfig: {
            enabledProviders: ["PROVIDER_UNSPECIFIED", "PHONE_SMS"],
            state: "ENABLED",
          },
          testPhoneNumbers: { "1234567890": "fake-code", "1(555)555-5555": "another-fake-code" },
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.allowPasswordSignup).to.be.true;
          expect(res.body.disableAuth).to.be.false;
          expect(res.body.displayName).to.eql("display");
          expect(res.body.enableAnonymousUser).to.be.true;
          expect(res.body.enableEmailLinkSignin).to.be.true;
          expect(res.body.mfaConfig).to.eql({
            enabledProviders: ["PROVIDER_UNSPECIFIED", "PHONE_SMS"],
            state: "ENABLED",
          });
          expect(res.body.testPhoneNumbers).to.eql({
            "+1234567890": "fake-code",
            "+15555555555": "another-fake-code",
          });
        });
    });
  });
});
