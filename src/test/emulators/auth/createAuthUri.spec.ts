import { expect } from "chai";
import { PROVIDER_PASSWORD, SIGNIN_METHOD_EMAIL_LINK } from "../../../emulator/auth/state";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import {
  expectStatusCode,
  registerUser,
  signInWithFakeClaims,
  signInWithEmailLink,
  updateProjectConfig,
  registerTenant,
  updateConfig,
} from "./helpers";

describeAuthEmulator("accounts:createAuthUri", ({ authApi }) => {
  it("should report not registered user as not registered", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: "notregistered@example.com" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("registered").equals(false);
        expect(res.body).to.have.property("sessionId").that.is.a("string");
      });
  });

  it("should not show registered field with improved email privacy enabled", async () => {
    await updateConfig(
      authApi(),
      PROJECT_ID,
      {
        emailPrivacyConfig: {
          enableImprovedEmailPrivacy: true,
        },
      },
      "emailPrivacyConfig",
    );
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: "notregistered@example.com" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.not.have.property("registered");
        expect(res.body).to.have.property("sessionId").that.is.a("string");
      });
  });

  it("should return providers for a registered user", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await registerUser(authApi(), user);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: user.email })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("registered").equals(true);
        expect(res.body).to.have.property("allProviders").eql(["password"]);
        expect(res.body).to.have.property("signinMethods").eql(["password"]);
        expect(res.body).to.have.property("sessionId").that.is.a("string");
      });
  });

  it("should not return providers for a registered user with improved email privacy enabled", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await updateConfig(
      authApi(),
      PROJECT_ID,
      {
        emailPrivacyConfig: {
          enableImprovedEmailPrivacy: true,
        },
      },
      "emailPrivacyConfig",
    );
    await registerUser(authApi(), user);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: user.email })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.not.have.property("registered");
        expect(res.body).to.not.have.property("allProviders").eql(["password"]);
        expect(res.body).to.not.have.property("signinMethods").eql(["password"]);
        expect(res.body).to.have.property("sessionId").that.is.a("string");
      });
  });

  it("should return existing sessionId if provided", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({
        continueUri: "http://example.com/",
        identifier: "notregistered@example.com",
        sessionId: "my-session-1",
      })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("registered").equals(false);
        expect(res.body).to.have.property("sessionId").equals("my-session-1");
      });
  });

  it("should find user by email ignoring case", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await registerUser(authApi(), user);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: "AlIcE@exAMPle.COM" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.registered).equals(true);
      });
  });

  it("should find user by either IDP email or 'top-level' email", async () => {
    const email = "bob@example.com";
    const emailAtProvider = "alice@example.com";
    const providerId = "google.com";

    const { idToken } = await signInWithFakeClaims(authApi(), providerId, {
      sub: "12345",
      email: emailAtProvider,
    });
    await signInWithEmailLink(authApi(), email, idToken);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: email })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.registered).to.equal(true);
        expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD, providerId]);
        expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK, providerId]);
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: emailAtProvider })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.registered).to.equal(true);
        expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD, providerId]);
        expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK, providerId]);
      });
  });

  it("should not list IDP sign-in methods when allowDuplicateEmails", async () => {
    const email = "bob@example.com";
    const emailAtProvider = "alice@example.com";
    const providerId = "google.com";

    const { idToken } = await signInWithFakeClaims(authApi(), providerId, {
      sub: "12345",
      email: emailAtProvider,
    });
    await signInWithEmailLink(authApi(), email, idToken);

    await updateProjectConfig(authApi(), { signIn: { allowDuplicateEmails: true } });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: email })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.registered).to.equal(true);
        expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD]);
        expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK]);
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ continueUri: "http://example.com/", identifier: emailAtProvider })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.registered).to.equal(true);
        expect(res.body.allProviders).to.have.members([PROVIDER_PASSWORD]);
        expect(res.body.signinMethods).to.have.members([SIGNIN_METHOD_EMAIL_LINK]);
      });
  });

  it("should error if identifier or continueUri is not provided", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({
        /* no identifier */
        continueUri: "http://example.com/",
      })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_IDENTIFIER");
      });
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({
        identifier: "me@example.com",
      })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_CONTINUE_URI");
      });
  });

  it("should error if identifier is invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ identifier: "invalid", continueUri: "http://localhost/" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_IDENTIFIER");
      });
  });

  it("should error if continueUri is invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({ identifier: "me@example.com", continueUri: "invalid" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_CONTINUE_URI");
      });
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:createAuthUri")
      .send({
        tenantId: tenant.tenantId,
        continueUri: "http://example.com/",
        identifier: "notregistered@example.com",
      })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });
});
