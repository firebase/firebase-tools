import { expect } from "chai";
import { expectStatusCode } from "./testing/helpers";
import { describeAuthEmulator, PROJECT_ID } from "./testing/setup";

describeAuthEmulator("config management", ({ authApi }) => {
  describe("updateConfig", () => {
    it("updates the project level config", async () => {
      const updateMask =
        "signIn.allowDuplicateEmails,blockingFunctions.forwardInboundCredentials.idToken";

      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .query({ updateMask })
        .send({
          signIn: { allowDuplicateEmails: true },
          blockingFunctions: { forwardInboundCredentials: { idToken: true } },
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.signIn?.allowDuplicateEmails).to.be.true;
          expect(res.body.blockingFunctions).to.eql({
            forwardInboundCredentials: { idToken: true },
          });
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
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.signIn?.allowDuplicateEmails).to.be.true;
          expect(res.body.blockingFunctions).to.eql({
            forwardInboundCredentials: { idToken: true },
          });
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
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.signIn?.allowDuplicateEmails).to.be.true;
          expect(res.body.blockingFunctions).to.eql({
            forwardInboundCredentials: { idToken: true },
          });
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
        });
    });

    it("should error when updating an invalid blocking function event", async () => {
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({
          blockingFunctions: {
            triggers: {
              invalidEventTrigger: {
                functionUri: "http://localhost",
              },
            },
          },
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error).to.have.property("message").contains("INVALID_BLOCKING_FUNCTION");
        });
    });

    it("should error if functionUri is invalid", async () => {
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({
          blockingFunctions: {
            triggers: {
              beforeCreate: {
                functionUri: "invalidUri",
              },
            },
          },
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error).to.have.property("message").contains("INVALID_BLOCKING_FUNCTION");
        });
    });
  });

  describe("getConfig", () => {
    it("should return the project level config", async () => {
      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send()
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("signIn").eql({
            allowDuplicateEmails: false /* default value */,
          });
          expect(res.body).to.have.property("blockingFunctions").eql({});
        });
    });

    it("should return updated config fields", async () => {
      await authApi()
        .patch(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send({
          signIn: { allowDuplicateEmails: true },
          blockingFunctions: { forwardInboundCredentials: { idToken: true } },
        });

      await authApi()
        .get(`/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`)
        .set("Authorization", "Bearer owner")
        .send()
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("signIn").eql({
            allowDuplicateEmails: true,
          });
          expect(res.body)
            .to.have.property("blockingFunctions")
            .eql({
              forwardInboundCredentials: { idToken: true },
            });
        });
    });
  });
});
