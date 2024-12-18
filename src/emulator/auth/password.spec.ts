import { expect } from "chai";
import nock from "nock";
import jsonwebtoken from "jsonwebtoken";
import { FirebaseJwtPayload } from "./operations.js";
import { describeAuthEmulator, PROJECT_ID } from "./testing/setup.js";
import {
  BEFORE_SIGN_IN_PATH,
  BEFORE_SIGN_IN_URL,
  BLOCKING_FUNCTION_HOST,
  DISPLAY_NAME,
  expectStatusCode,
  getAccountInfoByLocalId,
  PHOTO_URL,
  registerTenant,
  registerUser,
  TEST_MFA_INFO,
  updateAccountByLocalId,
  updateConfig,
} from "./testing/helpers.js";

describeAuthEmulator("accounts:signInWithPassword", ({ authApi, getClock }) => {
  it("should issue tokens when email and password are valid", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: user.password });

    expectStatusCode(200, res);
    expect(res.body.localId).equals(localId);
    expect(res.body.email).equals(user.email);
    expect(res.body).to.have.property("registered").equals(true);
    expect(res.body).to.have.property("refreshToken").that.is.a("string");

    const idToken = res.body.idToken;
    const decoded = jsonwebtoken.decode(idToken, { complete: true }) as unknown as {
      header: jsonwebtoken.JwtHeader;
      payload: FirebaseJwtPayload;
    } | null;
    expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
    expect(decoded!.header.alg).to.eql("none");
    expect(decoded!.payload.user_id).to.equal(localId);
    expect(decoded!.payload).not.to.have.property("provider_id");
    expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
  });

  it("should update lastLoginAt on successful login", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);

    const beforeLogin = await getAccountInfoByLocalId(authApi(), localId);
    expect(beforeLogin.lastLoginAt).to.equal(Date.now().toString());

    getClock().tick(4000);

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: user.password });
    expectStatusCode(200, res);

    const afterLogin = await getAccountInfoByLocalId(authApi(), localId);
    expect(afterLogin.lastLoginAt).to.equal(Date.now().toString());
  });

  it("should validate email address ignoring case", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "AlIcE@exAMPle.COM", password: user.password });
    expectStatusCode(200, res);
    expect(res.body.localId).equals(localId);
  });

  it("should error if email or password is missing", async () => {
    const noEmailRes = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ /* no email */ password: "notasecret" });
    expectStatusCode(400, noEmailRes);
    expect(noEmailRes.body.error.message).equals("MISSING_EMAIL");

    const noPasswordRes = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "nosuchuser@example.com" /* no password */ });
    expectStatusCode(400, noPasswordRes);
    expect(noPasswordRes.body.error.message).equals("MISSING_PASSWORD");
  });

  it("should error if email is invalid", async () => {
    const invalidEmailRes = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "ill-formatted-email", password: "notasecret" });
    expectStatusCode(400, invalidEmailRes);
    expect(invalidEmailRes.body.error.message).equals("INVALID_EMAIL");

    const emptyEmailRes = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "", password: "notasecret" });
    expectStatusCode(400, emptyEmailRes);
    expect(emptyEmailRes.body.error.message).equals("INVALID_EMAIL");
  });

  it("should error if email is not found", async () => {
    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "nosuchuser@example.com", password: "notasecret" });
    expectStatusCode(400, res);
    expect(res.body.error.message).equals("EMAIL_NOT_FOUND");
  });

  it("should error if email is not found with improved email privacy enabled", async () => {
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

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "nosuchuser@example.com", password: "notasecret" });
    expectStatusCode(400, res);
    expect(res.body.error.message).equals("INVALID_LOGIN_CREDENTIALS");
  });

  it("should error if password is wrong", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await registerUser(authApi(), user);
    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      // Passwords are case sensitive. The uppercase one below doesn't match.
      .send({ email: user.email, password: "NOTASECRET" });
    expectStatusCode(400, res);
    expect(res.body.error.message).equals("INVALID_PASSWORD");
  });

  it("should error if password is wrong with improved email privacy enabled", async () => {
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
    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      // Passwords are case sensitive. The uppercase one below doesn't match.
      .send({ email: user.email, password: "NOTASECRET" });
    expectStatusCode(400, res);
    expect(res.body.error.message).equals("INVALID_LOGIN_CREDENTIALS");
  });

  it("should error if user is disabled", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: "notasecret" });
    expectStatusCode(400, res);
    expect(res.body.error.message).to.equal("USER_DISABLED");
  });

  it("should return pending credential if user has MFA", async () => {
    const user = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
    };
    await registerUser(authApi(), user);

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: user.password });
    expectStatusCode(200, res);
    expect(res.body).not.to.have.property("idToken");
    expect(res.body).not.to.have.property("refreshToken");
    expect(res.body.mfaPendingCredential).to.be.a("string");
    expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId });
    expectStatusCode(400, res);
    expect(res.body.error.message).to.include("PROJECT_DISABLED");
  });

  it("should error if password sign up is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      allowPasswordSignup: false,
    });

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId });
    expectStatusCode(400, res);
    expect(res.body.error.message).to.include("PASSWORD_LOGIN_DISABLED");
  });

  it("should return pending credential if user has MFA and enabled on tenant projects", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      allowPasswordSignup: true,
      mfaConfig: {
        state: "ENABLED",
      },
    });
    const user = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
      tenantId: tenant.tenantId,
    };
    await registerUser(authApi(), user);

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId, email: user.email, password: user.password });
    expectStatusCode(200, res);
    expect(res.body).not.to.have.property("idToken");
    expect(res.body).not.to.have.property("refreshToken");
    expect(res.body.mfaPendingCredential).to.be.a("string");
    expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
  });

  describe("when blocking functions are present", () => {
    afterEach(() => {
      expect(nock.isDone()).to.be.true;
      nock.cleanAll();
    });

    it("should update modifiable fields before sign in", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      const { localId } = await registerUser(authApi(), user);
      await updateConfig(
        authApi(),
        PROJECT_ID,
        {
          blockingFunctions: {
            triggers: {
              beforeSignIn: {
                functionUri: BEFORE_SIGN_IN_URL,
              },
            },
          },
        },
        "blockingFunctions",
      );
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_SIGN_IN_PATH)
        .reply(200, {
          userRecord: {
            updateMask: "displayName,photoUrl,emailVerified,customClaims,sessionClaims",
            displayName: DISPLAY_NAME,
            photoUrl: PHOTO_URL,
            emailVerified: true,
            customClaims: { customAttribute: "custom" },
            sessionClaims: { sessionAttribute: "session" },
          },
        });

      const res = await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, password: user.password });

      expectStatusCode(200, res);
      expect(res.body.localId).equals(localId);
      expect(res.body.email).equals(user.email);
      expect(res.body).to.have.property("registered").equals(true);
      expect(res.body).to.have.property("refreshToken").that.is.a("string");

      const idToken = res.body.idToken;
      const decoded = jsonwebtoken.decode(idToken, { complete: true }) as unknown as {
        header: jsonwebtoken.JwtHeader;
        payload: FirebaseJwtPayload;
      } | null;
      expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
      expect(decoded!.header.alg).to.eql("none");

      expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
      expect(decoded!.payload.picture).to.equal(PHOTO_URL);
      expect(decoded!.payload.email_verified).to.be.true;
      expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
      expect(decoded!.payload).to.have.property("sessionAttribute").equals("session");
    });

    it("should disable user if set", async () => {
      const user = { email: "alice@example.com", password: "notasecret" };
      await registerUser(authApi(), user);
      await updateConfig(
        authApi(),
        PROJECT_ID,
        {
          blockingFunctions: {
            triggers: {
              beforeSignIn: {
                functionUri: BEFORE_SIGN_IN_URL,
              },
            },
          },
        },
        "blockingFunctions",
      );
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_SIGN_IN_PATH)
        .reply(200, {
          userRecord: {
            updateMask: "disabled",
            disabled: true,
          },
        });

      const res = await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, password: user.password });
      expectStatusCode(400, res);
      expect(res.body.error.message).to.equal("USER_DISABLED");
    });

    it("should not trigger blocking function if user has MFA", async () => {
      const user = {
        email: "alice@example.com",
        password: "notasecret",
        mfaInfo: [TEST_MFA_INFO],
      };
      await registerUser(authApi(), user);
      await updateConfig(
        authApi(),
        PROJECT_ID,
        {
          blockingFunctions: {
            triggers: {
              beforeSignIn: {
                functionUri: BEFORE_SIGN_IN_URL,
              },
            },
          },
        },
        "blockingFunctions",
      );
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_SIGN_IN_PATH)
        .reply(200, {
          userRecord: {
            updateMask: "disabled",
            disabled: true,
          },
        });

      const res = await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, password: user.password });
      expectStatusCode(200, res);
      expect(res.body).not.to.have.property("idToken");
      expect(res.body).not.to.have.property("refreshToken");
      expect(res.body.mfaPendingCredential).to.be.a("string");
      expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);

      // Shouldn't trigger nock calls
      expect(nock.isDone()).to.be.false;
      nock.cleanAll();
    });
  });
});
