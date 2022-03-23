import { expect } from "chai";
import { expectStatusCode, registerAnonUser } from "./helpers";
import { describeAuthEmulator, PROJECT_ID } from "./setup";

describeAuthEmulator("config management", ({ authApi }) => {
  describe("updateConfig", () => {
    it("updates the project level config", async () => {
      const updateMask =
        "signIn.allowDuplicateEmails,blockingFunctions.forwardInboundCredentials.idToken,usageMode";

      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .query({ updateMask })
        .send({
          signIn: { allowDuplicateEmails: true },
          blockingFunctions: { forwardInboundCredentials: { idToken: true } },
          usageMode: "PASSTHROUGH",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.signIn?.allowDuplicateEmails).to.be.true;
          expect(res.body.blockingFunctions).to.eql({
            forwardInboundCredentials: { idToken: true },
          });
          expect(res.body.usageMode).to.eql("PASSTHROUGH");
        });
    });

    it("does not update if the field does not exist on the update config", async () => {
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .query({ updateMask: "displayName" })
        .send({})
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).not.to.have.property("displayName");
        });
    });

    it("performs a full update if the update mask is empty", async () => {
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({
          signIn: { allowDuplicateEmails: true },
          blockingFunctions: { forwardInboundCredentials: { idToken: true } },
          usageMode: "PASSTHROUGH",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.signIn?.allowDuplicateEmails).to.be.true;
          expect(res.body.blockingFunctions).to.eql({
            forwardInboundCredentials: { idToken: true },
          });
          expect(res.body.usageMode).to.eql("PASSTHROUGH");
        });
    });

    it("performs a full update with production defaults if the update mask is empty", async () => {
      // Update to non-default values
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({
          signIn: { allowDuplicateEmails: true },
          blockingFunctions: { forwardInboundCredentials: { idToken: true } },
          usageMode: "PASSTHROUGH",
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.signIn?.allowDuplicateEmails).to.be.true;
          expect(res.body.blockingFunctions).to.eql({
            forwardInboundCredentials: { idToken: true },
          });
          expect(res.body.usageMode).to.eql("PASSTHROUGH");
        });

      // Perform a full update and check that production defaults are set
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({})
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.signIn?.allowDuplicateEmails).to.be.false;
          expect(res.body.blockingFunctions).to.eql({});
          expect(res.body.usageMode).to.eql("DEFAULT");
        });
    });

    it("should error on unspecified usageMode", async () => {
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({
          usageMode: "USAGE_MODE_UNSPECIFIED",
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error).to.have.property("message").equals("Invalid usage mode provided");
        });
    });

    it("should error when users are present for passthrough mode", async () => {
      await registerAnonUser(authApi());

      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({
          usageMode: "PASSTHROUGH",
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("Users are present, unable to set passthrough mode");
        });
    });
  });
});
