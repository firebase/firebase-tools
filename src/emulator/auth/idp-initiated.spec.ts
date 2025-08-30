import { expect } from "chai";
import { describeAuthEmulator } from "./testing/setup";

describeAuthEmulator("IdP-initiated SAML handlers", ({ authApi }) => {
  describe("POST /emulator/auth/saml/acs/:providerId", () => {
    it("should handle IdP-initiated SAML POST with valid SAMLResponse", async () => {
      const providerId = "saml.example";
      const userEmail = "user@example.com";
      const samlResponse = JSON.stringify({
        assertion: {
          subject: { nameId: userEmail },
          attributeStatements: [{
            attributes: {
              displayName: "John Doe",
              email: userEmail
            }
          }]
        }
      });

      await authApi()
        .post(`/emulator/auth/saml/acs/${providerId}`)
        .send({
          SAMLResponse: samlResponse,
          RelayState: "/dashboard"
        })
        .expect(200)
        .expect("Content-Type", /html/)
        .then((res) => {
          expect(res.text).to.include("Authentication Successful");
          expect(res.text).to.include(userEmail);
          expect(res.text).to.include(providerId);
        });
    });

    it("should handle IdP-initiated SAML POST without RelayState", async () => {
      const providerId = "saml.workos";
      const userEmail = "user@company.com";
      const samlResponse = JSON.stringify({
        assertion: {
          subject: { nameId: userEmail },
          attributeStatements: [{
            attributes: {
              firstName: "Jane",
              lastName: "Smith",
              email: userEmail
            }
          }]
        }
      });

      await authApi()
        .post(`/emulator/auth/saml/acs/${providerId}`)
        .send({
          SAMLResponse: samlResponse
        })
        .expect(200)
        .expect("Content-Type", /html/)
        .then((res) => {
          expect(res.text).to.include("Authentication Successful");
          expect(res.text).to.include(userEmail);
        });
    });

    it("should error with invalid provider ID", async () => {
      const invalidProviderId = "invalid.provider";
      const samlResponse = JSON.stringify({
        assertion: {
          subject: { nameId: "user@example.com" },
          attributeStatements: []
        }
      });

      await authApi()
        .post(`/emulator/auth/saml/acs/${invalidProviderId}`)
        .send({
          SAMLResponse: samlResponse
        })
        .expect(400)
        .then((res) => {
          expect(res.body.authEmulator.error).to.include("Invalid provider ID");
        });
    });

    it("should error without SAMLResponse", async () => {
      const providerId = "saml.example";

      await authApi()
        .post(`/emulator/auth/saml/acs/${providerId}`)
        .send({
          RelayState: "/dashboard"
        })
        .expect(400)
        .then((res) => {
          expect(res.body.authEmulator.error).to.include("Missing SAMLResponse parameter");
        });
    });

    it("should error with malformed SAMLResponse", async () => {
      const providerId = "saml.example";

      await authApi()
        .post(`/emulator/auth/saml/acs/${providerId}`)
        .send({
          SAMLResponse: "invalid-json"
        })
        .expect(400)
        .then((res) => {
          expect(res.body.authEmulator.error).to.include("IdP-initiated SAML processing failed");
        });
    });
  });

  describe("GET /emulator/auth/saml/acs/:providerId", () => {
    it("should handle IdP-initiated SAML GET with valid SAMLResponse", async () => {
      const providerId = "saml.example";
      const userEmail = "user@example.com";
      const samlResponse = JSON.stringify({
        assertion: {
          subject: { nameId: userEmail },
          attributeStatements: [{
            attributes: {
              displayName: "John Doe",
              email: userEmail
            }
          }]
        }
      });

      await authApi()
        .get(`/emulator/auth/saml/acs/${providerId}`)
        .query({
          SAMLResponse: samlResponse,
          RelayState: "/app"
        })
        .expect(200)
        .expect("Content-Type", /html/)
        .then((res) => {
          expect(res.text).to.include("Authentication Successful");
          expect(res.text).to.include(userEmail);
          expect(res.text).to.include(providerId);
        });
    });

    it("should handle IdP-initiated SAML GET with complex attributes", async () => {
      const providerId = "saml.adfs";
      const userEmail = "complex@domain.com";
      const samlResponse = JSON.stringify({
        assertion: {
          subject: { nameId: userEmail },
          attributeStatements: [{
            attributes: {
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "Complex User",
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "Complex",
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "User",
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": userEmail
            }
          }]
        }
      });

      await authApi()
        .get(`/emulator/auth/saml/acs/${providerId}`)
        .query({
          SAMLResponse: samlResponse
        })
        .expect(200)
        .expect("Content-Type", /html/)
        .then((res) => {
          expect(res.text).to.include("Authentication Successful");
          expect(res.text).to.include(userEmail);
        });
    });

    it("should error with missing SAMLResponse query parameter", async () => {
      const providerId = "saml.example";

      await authApi()
        .get(`/emulator/auth/saml/acs/${providerId}`)
        .query({
          RelayState: "/dashboard"
        })
        .expect(400)
        .then((res) => {
          expect(res.body.authEmulator.error).to.include("Missing SAMLResponse parameter");
        });
    });

    it("should error with non-SAML provider ID", async () => {
      const invalidProviderId = "oauth.google";

      await authApi()
        .get(`/emulator/auth/saml/acs/${invalidProviderId}`)
        .query({
          SAMLResponse: JSON.stringify({
            assertion: {
              subject: { nameId: "user@example.com" }
            }
          })
        })
        .expect(400)
        .then((res) => {
          expect(res.body.authEmulator.error).to.include("Invalid provider ID");
        });
    });
  });

  describe("RelayState handling", () => {
    it("should preserve RelayState in redirect URL", async () => {
      const providerId = "saml.example";
      const userEmail = "relay@example.com";
      const relayState = "/specific/path?param=value";
      const samlResponse = JSON.stringify({
        assertion: {
          subject: { nameId: userEmail },
          attributeStatements: [{
            attributes: {
              email: userEmail
            }
          }]
        }
      });

      await authApi()
        .post(`/emulator/auth/saml/acs/${providerId}`)
        .send({
          SAMLResponse: samlResponse,
          RelayState: relayState
        })
        .expect(200)
        .then((res) => {
          expect(res.text).to.include("Authentication Successful");
          expect(res.text).to.include(`window.location.href = '${relayState}'`);
        });
    });

    it("should use default redirect when RelayState is missing", async () => {
      const providerId = "saml.example";
      const userEmail = "default@example.com";
      const samlResponse = JSON.stringify({
        assertion: {
          subject: { nameId: userEmail },
          attributeStatements: []
        }
      });

      await authApi()
        .post(`/emulator/auth/saml/acs/${providerId}`)
        .send({
          SAMLResponse: samlResponse
        })
        .expect(200)
        .then((res) => {
          expect(res.text).to.include("Authentication Successful");
          expect(res.text).to.include("window.location.href = '/'");
        });
    });
  });
});