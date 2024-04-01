import { expect } from "chai";
import { Tenant } from "../../../emulator/auth/state";
import { expectStatusCode, registerTenant } from "./helpers";
import { describeAuthEmulator } from "./setup";

describeAuthEmulator("tenant management", ({ authApi }) => {
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

          // Should have a non-empty tenantId and matching resource name
          expect(res.body).to.have.property("tenantId");
          expect(res.body.tenantId).to.not.eql("");
          expect(res.body).to.have.property("name");
          expect(res.body.name).to.eql(`projects/project-id/tenants/${res.body.tenantId}`);
        });
    });

    it("should create a tenant with default disabled settings", async () => {
      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/projects/project-id/tenants")
        .set("Authorization", "Bearer owner")
        .send({})
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.allowPasswordSignup).to.be.false;
          expect(res.body.disableAuth).to.be.false;
          expect(res.body.enableAnonymousUser).to.be.false;
          expect(res.body.enableEmailLinkSignin).to.be.false;
          expect(res.body.mfaConfig).to.eql({
            state: "DISABLED",
            enabledProviders: [],
          });
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

    it("should create tenants with default enabled settings if they do not exist", async () => {
      // No projects exist initially
      const projectId = "project-id";
      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.tenants).to.have.length(0);
        });

      // Get should implicitly create a tenant that does not exist
      const tenantId = "tenant-id";
      const createdTenant: Tenant = {
        tenantId,
        name: `projects/${projectId}/tenants/${tenantId}`,
        allowPasswordSignup: true,
        disableAuth: false,
        enableAnonymousUser: true,
        enableEmailLinkSignin: true,
        mfaConfig: {
          enabledProviders: ["PHONE_SMS"],
          state: "ENABLED",
        },
      };
      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenantId}`)
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.eql(createdTenant);
        });

      // The newly created tenant should be returned
      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants`)
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.tenants).to.have.length(1);
          expect(res.body.tenants[0].tenantId).to.eql(tenantId);
        });
    });
  });

  describe("deleteTenants", () => {
    it("should delete tenants", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});

      await authApi()
        .delete(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`,
        )
        .set("Authorization", "Bearer owner")
        .then((res) => {
          expectStatusCode(200, res);
        });
    });

    it("should delete tenants if request body is passed", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});

      await authApi()
        .delete(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`,
        )
        .set("Authorization", "Bearer owner")
        // Sets content-type and sends "{}" in request payload. This is very
        // uncommon for HTTP DELETE requests, but clients like the Node.js Admin
        // SDK do it anyway. We want the emulator to tolerate this.
        .send({})
        .then((res) => {
          expectStatusCode(200, res);
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
        "allowPasswordSignup,disableAuth,displayName,enableAnonymousUser,enableEmailLinkSignin,mfaConfig";

      await authApi()
        .patch(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`,
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
        });
    });

    it("does not update if the field does not exist on the update tenant", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});
      const updateMask = "displayName";

      await authApi()
        .patch(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`,
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
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`,
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
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`,
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
        });
    });

    it("performs a full update with production defaults if the update mask is empty", async () => {
      const projectId = "project-id";
      const tenant = await registerTenant(authApi(), projectId, {});

      await authApi()
        .patch(
          `/identitytoolkit.googleapis.com/v2/projects/${projectId}/tenants/${tenant.tenantId}`,
        )
        .set("Authorization", "Bearer owner")
        .send({})
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.allowPasswordSignup).to.be.false;
          expect(res.body.disableAuth).to.be.false;
          expect(res.body.enableAnonymousUser).to.be.false;
          expect(res.body.enableEmailLinkSignin).to.be.false;
          expect(res.body.mfaConfig).to.eql({
            enabledProviders: [],
            state: "DISABLED",
          });
        });
    });
  });
});
