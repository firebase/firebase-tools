import { expect } from "chai";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import {
  expectStatusCode,
  registerUser,
  registerAnonUser,
  updateAccountByLocalId,
  expectIdTokenExpired,
  inspectOobs,
  registerTenant,
  updateConfig,
} from "./helpers";

describeAuthEmulator("accounts:sendOobCode", ({ authApi, getClock }) => {
  it("should generate OOB code for verify email", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { idToken, localId } = await registerUser(authApi(), user);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ idToken, requestType: "VERIFY_EMAIL" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(user.email);

        // These fields should not be set since returnOobLink is not set.
        expect(res.body).not.to.have.property("oobCode");
        expect(res.body).not.to.have.property("oobLink");
      });

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(1);
    expect(oobs[0].email).to.equal(user.email);
    expect(oobs[0].requestType).to.equal("VERIFY_EMAIL");

    // The returned oobCode can be redeemed to verify the email.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      // OOB code is enough, no idToken needed.
      .send({ oobCode: oobs[0].oobCode })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
        expect(res.body.email).to.equal(user.email);
        expect(res.body.emailVerified).to.equal(true);
      });

    // oobCode is removed after redeemed.
    const oobs2 = await inspectOobs(authApi());
    expect(oobs2).to.have.length(0);
  });

  it("should return OOB code directly for requests with OAuth 2", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await registerUser(authApi(), user);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .set("Authorization", "Bearer owner")
      .send({ email: user.email, requestType: "PASSWORD_RESET", returnOobLink: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(user.email);
        expect(res.body.oobCode).to.be.a("string");
        expect(res.body.oobLink).to.be.a("string");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .set("Authorization", "Bearer owner")
      .send({ email: user.email, requestType: "VERIFY_EMAIL", returnOobLink: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(user.email);
        expect(res.body.oobCode).to.be.a("string");
        expect(res.body.oobLink).to.be.a("string");
      });
  });

  it("should return OOB code by idToken for OAuth 2 requests as well", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { idToken } = await registerUser(authApi(), user);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .set("Authorization", "Bearer owner")
      .send({ idToken, requestType: "VERIFY_EMAIL", returnOobLink: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(user.email);
        expect(res.body.oobCode).to.be.a("string");
        expect(res.body.oobLink).to.be.a("string");
      });
  });

  it("should error when trying to verify email without idToken or email", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await registerUser(authApi(), user);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ requestType: "VERIFY_EMAIL" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equal("INVALID_ID_TOKEN");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .set("Authorization", "Bearer owner")
      // This causes a different error message to be returned, see below.
      .send({ returnOobLink: true, requestType: "VERIFY_EMAIL" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equal("MISSING_EMAIL");
      });

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(0);
  });

  it("should error when trying to verify email without idToken if not returnOobLink", async () => {
    const user = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      // email here is ignored because returnOobLink is not set.
      .send({ email: user.email, requestType: "VERIFY_EMAIL" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equal("INVALID_ID_TOKEN");
      });

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(0);
  });

  it("should error when trying to verify email not associated with any user", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .set("Authorization", "Bearer owner")
      .send({ email: "nosuchuser@example.com", returnOobLink: true, requestType: "VERIFY_EMAIL" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equal("USER_NOT_FOUND");
      });

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(0);
  });

  it("should error when verifying email for accounts without email", async () => {
    const { idToken } = await registerAnonUser(authApi());

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ idToken, requestType: "VERIFY_EMAIL" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equal("MISSING_EMAIL");
      });

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(0);
  });

  it("should error if user is disabled", async () => {
    const { localId, idToken, email } = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "foobar",
    });
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ email, idToken, requestType: "VERIFY_EMAIL" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
      });
  });

  it("should error when continueUrl is invalid", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        requestType: "VERIFY_EMAIL",
        continueUrl: "noSchemeOrHost",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contain("INVALID_CONTINUE_URI");
      });

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(0);
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error for email sign in if not enabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      enableEmailLinkSignin: false,
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId, email: "bob@example.com", requestType: "EMAIL_SIGNIN" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("OPERATION_NOT_ALLOWED");
      });
  });

  it("should generate OOB code for reset password", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { idToken } = await registerUser(authApi(), user);

    getClock().tick(2000); // Wait for idToken to be issued in the past.

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ requestType: "PASSWORD_RESET", email: user.email })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(user.email);

        // These fields should not be set since returnOobLink is not set.
        expect(res.body).not.to.have.property("oobCode");
        expect(res.body).not.to.have.property("oobLink");
      });

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(1);
    expect(oobs[0].email).to.equal(user.email);
    expect(oobs[0].requestType).to.equal("PASSWORD_RESET");

    // The returned oobCode can be redeemed to reset the password.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:resetPassword")
      .query({ key: "fake-api-key" })
      .send({ oobCode: oobs[0].oobCode, newPassword: "notasecret2" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.requestType).to.equal("PASSWORD_RESET");
        expect(res.body.email).to.equal(user.email);
      });

    // All old idTokens are invalidated.
    await expectIdTokenExpired(authApi(), idToken);
  });

  it("should return purpose of oobCodes via resetPassword endpoint", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { idToken } = await registerUser(authApi(), user);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ requestType: "PASSWORD_RESET", email: user.email })
      .then((res) => expectStatusCode(200, res));

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ requestType: "VERIFY_EMAIL", idToken })
      .then((res) => expectStatusCode(200, res));

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .query({ key: "fake-api-key" })
      .send({ email: "bob@example.com", requestType: "EMAIL_SIGNIN" })
      .then((res) => expectStatusCode(200, res));

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(3);

    for (const oob of oobs) {
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:resetPassword")
        .query({ key: "fake-api-key" })
        // If newPassword is not set, this API will just return the purpose
        // (requestType) of the code without consuming it.
        .send({ oobCode: oob.oobCode })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.requestType).to.equal(oob.requestType);
          if (oob.requestType === "EMAIL_SIGNIN") {
            // Do not reveal the email when inspecting an email sign-in oobCode.
            // Instead, the client must provide email (e.g. by asking the user)
            // when they call the emailLinkSignIn endpoint.
            // See: https://firebase.google.com/docs/auth/web/email-link-auth#security_concerns
            expect(res.body).not.to.have.property("email");
          } else {
            expect(res.body.email).to.equal(oob.email);
          }
        });
    }

    // OOB codes are not consumed by the lookup above.
    const oobs2 = await inspectOobs(authApi());
    expect(oobs2).to.have.length(3);
  });

  it("should error on resetPassword if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:resetPassword")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error on resetPassword if password sign up is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      allowPasswordSignup: false,
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:resetPassword")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PASSWORD_LOGIN_DISABLED");
      });
  });

  it("should error when sending a password reset to non-existent user with improved email privacy disabled", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .set("Authorization", "Bearer owner")
      .send({ email: user.email, requestType: "PASSWORD_RESET", returnOobLink: true })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_NOT_FOUND");
      });
  });

  it("should return email address when sending a password reset to non-existent user with improved email privacy enabled", async () => {
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
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendOobCode")
      .set("Authorization", "Bearer owner")
      .send({ email: user.email, requestType: "PASSWORD_RESET", returnOobLink: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body)
          .to.have.property("kind")
          .equals("identitytoolkit#GetOobConfirmationCodeResponse");
        expect(res.body).to.have.property("email").equals(user.email);
      });
  });
});
