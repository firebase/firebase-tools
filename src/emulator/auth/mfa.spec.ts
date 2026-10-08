import { expect } from "chai";
import nock from "../../test/helpers/nock";
import { describeAuthEmulator, PROJECT_ID } from "./testing/setup";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import {
  BEFORE_SIGN_IN_PATH,
  BEFORE_SIGN_IN_URL,
  BLOCKING_FUNCTION_HOST,
  DISPLAY_NAME,
  enrollPhoneMfa,
  enrollTotpMfa,
  expectStatusCode,
  getAccountInfoByIdToken,
  getAccountInfoByLocalId,
  inspectVerificationCodes,
  PHOTO_URL,
  registerTenant,
  registerUser,
  signInWithEmailLink,
  signInWithPassword,
  signInWithPhoneNumber,
  TEST_PHONE_NUMBER,
  TEST_PHONE_NUMBER_2,
  TEST_PHONE_NUMBER_OBFUSCATED,
  updateAccountByLocalId,
  updateConfig,
} from "./testing/helpers";
import { MfaEnrollment } from "./types";
import { FirebaseJwtPayload } from "./operations";
import { generateTotpCode, verifyTotpCode } from "./totp";

describeAuthEmulator("mfa enrollment", ({ authApi, getClock }) => {
  it("should error if account does not have email verified", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "unverified@example.com",
      password: "testing",
    });
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneEnrollmentInfo: { phoneNumber: TEST_PHONE_NUMBER } })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal(
          "UNVERIFIED_EMAIL : Need to verify email first before enrolling second factors.",
        );
      });
  });

  it("should allow phone enrollment for an existing account", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    const { idToken } = await signInWithEmailLink(authApi(), "foo@example.com");
    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneEnrollmentInfo: { phoneNumber } })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.phoneSessionInfo.sessionInfo).to.be.a("string");
        return res.body.phoneSessionInfo.sessionInfo as string;
      });

    const codes = await inspectVerificationCodes(authApi());
    expect(codes).to.have.length(1);
    expect(codes[0].phoneNumber).to.equal(phoneNumber);
    expect(codes[0].sessionInfo).to.equal(sessionInfo);
    expect(codes[0].code).to.be.a("string");
    const { code } = codes[0];

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneVerificationInfo: { code, sessionInfo } });

    expectStatusCode(200, res);
    expect(res.body.idToken).to.be.a("string");
    expect(res.body.refreshToken).to.be.a("string");

    const userInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(userInfo.mfaInfo).to.be.an("array").with.lengthOf(1);
    expect(userInfo.mfaInfo![0].phoneInfo).to.equal(phoneNumber);
    const mfaEnrollmentId = userInfo.mfaInfo![0].mfaEnrollmentId;

    const decoded = decodeJwt(res.body.idToken, { complete: true }) as unknown as {
      header: JwtHeader;
      payload: FirebaseJwtPayload;
    } | null;
    expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
    expect(decoded!.payload.firebase.sign_in_second_factor).to.equal("phone");
    expect(decoded!.payload.firebase.second_factor_identifier).to.equal(mfaEnrollmentId);
  });

  it("should error if phoneEnrollmentInfo is not specified", async () => {
    const { idToken } = await signInWithEmailLink(authApi(), "foo@example.com");
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.contain("INVALID_ARGUMENT");
      });
  });

  it("should error if phoneNumber is invalid", async () => {
    const { idToken } = await signInWithEmailLink(authApi(), "foo@example.com");
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneEnrollmentInfo: { phoneNumber: "notaphonenumber" } })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.contain("INVALID_PHONE_NUMBER");
      });
  });

  it("should error if phoneNumber is a duplicate", async () => {
    const { idToken } = await signInWithEmailLink(authApi(), "foo@example.com");
    await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneEnrollmentInfo: { phoneNumber: TEST_PHONE_NUMBER } })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal(
          "SECOND_FACTOR_EXISTS : Phone number already enrolled as second factor for this account.",
        );
      });
  });

  it("should error if sign-in method of idToken is ineligible for MFA", async () => {
    const { idToken, localId } = await signInWithPhoneNumber(authApi(), TEST_PHONE_NUMBER);
    await updateAccountByLocalId(authApi(), localId, {
      email: "bob@example.com",
      emailVerified: true,
    });
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneEnrollmentInfo: { phoneNumber: TEST_PHONE_NUMBER_2 } })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal(
          "UNSUPPORTED_FIRST_FACTOR : MFA is not available for the given first factor.",
        );
      });
  });

  it("should error on mfaEnrollment:start if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error on mfaEnrollment:start if MFA is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "DISABLED",
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should error on mfaEnrollment:start if phone SMS is not an enabled provider", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "ENABLED",
        enabledProviders: ["PROVIDER_UNSPECIFIED"],
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should error on mfaEnrollment:finalize if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error on mfaEnrollment:finalize if MFA is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "DISABLED",
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should error on mfaEnrollment:finalize if phone SMS is not an enabled provider", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "ENABLED",
        enabledProviders: ["PROVIDER_UNSPECIFIED"],
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should allow sign-in with pending credential for MFA-enabled user", async () => {
    const email = "foo@example.com";
    const password = "abcdef";
    const { idToken, localId } = await registerUser(authApi(), { email, password });
    await updateAccountByLocalId(authApi(), localId, { emailVerified: true });
    await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER);
    const beforeSignIn = await getAccountInfoByLocalId(authApi(), localId);

    getClock().tick(3333);

    const { mfaPendingCredential, mfaEnrollmentId } = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email, password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        const mfaPendingCredential = res.body.mfaPendingCredential as string;
        const mfaInfo = res.body.mfaInfo as MfaEnrollment[];
        expect(mfaPendingCredential).to.be.a("string");
        expect(mfaInfo).to.be.an("array").with.lengthOf(1);
        expect(mfaInfo[0]?.phoneInfo).to.equal(TEST_PHONE_NUMBER_OBFUSCATED);

        // This must not be exposed right after first factor login.
        expect(mfaInfo[0]?.phoneInfo).not.to.have.property("unobfuscatedPhoneInfo");
        return { mfaPendingCredential, mfaEnrollmentId: mfaInfo[0].mfaEnrollmentId };
      });

    // Login / refresh timestamps should not change until MFA was successful.
    const afterFirstFactor = await getAccountInfoByLocalId(authApi(), localId);
    expect(afterFirstFactor.lastLoginAt).to.equal(beforeSignIn.lastLoginAt);
    expect(afterFirstFactor.lastRefreshAt).to.equal(beforeSignIn.lastRefreshAt);

    getClock().tick(4444);

    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start")
      .query({ key: "fake-api-key" })
      .send({
        mfaEnrollmentId,
        mfaPendingCredential,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.phoneResponseInfo.sessionInfo).to.be.a("string");
        return res.body.phoneResponseInfo.sessionInfo as string;
      });

    const code = (await inspectVerificationCodes(authApi()))[0].code;

    getClock().tick(5555);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({
        mfaPendingCredential,
        phoneVerificationInfo: {
          sessionInfo,
          code: code,
        },
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
        expect(res.body.refreshToken).to.be.a("string");

        const decoded = decodeJwt(res.body.idToken, { complete: true }) as unknown as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.payload.firebase.sign_in_second_factor).to.equal("phone");
        expect(decoded!.payload.firebase.second_factor_identifier).to.equal(mfaEnrollmentId);
      });

    // Login / refresh timestamps should now be updated.
    const afterMfa = await getAccountInfoByLocalId(authApi(), localId);
    expect(afterMfa.lastLoginAt).to.equal(Date.now().toString());
    expect(afterMfa.lastRefreshAt).to.equal(new Date().toISOString());
  });

  it("should error on mfaSignIn:start if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error on mfaSignIn:start if MFA is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "DISABLED",
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should error on mfaSignIn:start if phone SMS is not an enabled provider", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "ENABLED",
        enabledProviders: ["PROVIDER_UNSPECIFIED"],
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should error on mfaSignIn:finalize if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error on mfaSignIn:finalize if MFA is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "DISABLED",
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should error on mfaSignIn:finalize if phone SMS is not an enabled provider", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "ENABLED",
        enabledProviders: ["PROVIDER_UNSPECIFIED"],
      },
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").contains("OPERATION_NOT_ALLOWED");
      });
  });

  it("should allow withdrawing MFA for a user", async () => {
    const { idToken: token1 } = await signInWithEmailLink(authApi(), "foo@example.com");
    const { idToken } = await enrollPhoneMfa(authApi(), token1, TEST_PHONE_NUMBER);

    const { mfaInfo } = await getAccountInfoByIdToken(authApi(), idToken);
    expect(mfaInfo).to.have.lengthOf(1);
    const { mfaEnrollmentId } = mfaInfo![0]!;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:withdraw")
      .query({ key: "fake-api-key" })
      .send({ idToken, mfaEnrollmentId })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
        expect(res.body.refreshToken).to.be.a("string");

        const decoded = decodeJwt(res.body.idToken, { complete: true }) as unknown as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.payload.firebase).not.to.have.property("sign_in_second_factor");
        expect(decoded!.payload.firebase).not.to.have.property("second_factor_identifier");
      });

    const after = await getAccountInfoByIdToken(authApi(), idToken);
    expect(after.mfaInfo).to.have.lengthOf(0);
  });

  it("should error on mfaEnrollment:withdraw if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:withdraw")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  describe("when blocking functions are present", () => {
    afterEach(async () => {
      await updateConfig(
        authApi(),
        PROJECT_ID,
        {
          blockingFunctions: {},
        },
        "blockingFunctions",
      );
      expect(nock.isDone()).to.be.true;
      nock.cleanAll();
    });

    it("mfaSignIn:finalize should update modifiable fields before sign in", async () => {
      const email = "foo@example.com";
      const password = "abcdef";
      const { idToken, localId } = await registerUser(authApi(), { email, password });
      await updateAccountByLocalId(authApi(), localId, { emailVerified: true });
      await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER);

      getClock().tick(3333);

      const { mfaPendingCredential, mfaEnrollmentId } = await signInWithPassword(
        authApi(),
        email,
        password,
        true,
      );

      getClock().tick(4444);

      const sessionInfo = await authApi()
        .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start")
        .query({ key: "fake-api-key" })
        .send({
          mfaEnrollmentId,
          mfaPendingCredential,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.phoneResponseInfo.sessionInfo).to.be.a("string");
          return res.body.phoneResponseInfo.sessionInfo as string;
        });

      const code = (await inspectVerificationCodes(authApi()))[0].code;

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

      getClock().tick(5555);

      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
        .query({ key: "fake-api-key" })
        .send({
          mfaPendingCredential,
          phoneVerificationInfo: {
            sessionInfo,
            code: code,
          },
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.idToken).to.be.a("string");
          expect(res.body.refreshToken).to.be.a("string");

          const decoded = decodeJwt(res.body.idToken, { complete: true }) as unknown as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload.firebase.sign_in_second_factor).to.equal("phone");
          expect(decoded!.payload.firebase.second_factor_identifier).to.equal(mfaEnrollmentId);

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
          expect(decoded!.payload).to.have.property("sessionAttribute").equals("session");
        });
    });

    it("mfaSignIn:finalize should disable user if set", async () => {
      const email = "foo@example.com";
      const password = "abcdef";
      const { idToken, localId } = await registerUser(authApi(), { email, password });
      await updateAccountByLocalId(authApi(), localId, { emailVerified: true });
      await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER);

      getClock().tick(3333);

      const { mfaPendingCredential, mfaEnrollmentId } = await signInWithPassword(
        authApi(),
        email,
        password,
        true,
      );

      getClock().tick(4444);

      const sessionInfo = await authApi()
        .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start")
        .query({ key: "fake-api-key" })
        .send({
          mfaEnrollmentId,
          mfaPendingCredential,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.phoneResponseInfo.sessionInfo).to.be.a("string");
          return res.body.phoneResponseInfo.sessionInfo as string;
        });

      const code = (await inspectVerificationCodes(authApi()))[0].code;

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

      getClock().tick(5555);

      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
        .query({ key: "fake-api-key" })
        .send({
          mfaPendingCredential,
          phoneVerificationInfo: {
            sessionInfo,
            code: code,
          },
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
        });
    });
  });
});

describeAuthEmulator("mfa with TOTP", ({ authApi, getClock }) => {
  const password = "testing123";

  async function registerVerifiedUser(
    email: string,
    tenantId?: string,
  ): Promise<{ idToken: string; localId: string }> {
    const { idToken, localId } = await registerUser(authApi(), { email, password, tenantId });
    await updateAccountByLocalId(authApi(), localId, { emailVerified: true, tenantId });
    return { idToken, localId };
  }

  async function startTotpEnrollment(
    idToken: string,
  ): Promise<{ sessionInfo: string; sharedSecretKey: string }> {
    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, totpEnrollmentInfo: {} });
    expectStatusCode(200, res);
    return res.body.totpSessionInfo;
  }

  function decodeIdToken(idToken: string): FirebaseJwtPayload {
    const decoded = decodeJwt(idToken, { complete: true }) as unknown as {
      header: JwtHeader;
      payload: FirebaseJwtPayload;
    } | null;
    expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
    return decoded!.payload;
  }

  // A six digit code that is not valid for the secret right now.
  function wrongCode(secret: string): string {
    return verifyTotpCode(secret, "000000", 5) ? "111111" : "000000";
  }

  it("should return a shared secret on mfaEnrollment:start", async () => {
    const { idToken } = await registerVerifiedUser("alice@example.com");
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, totpEnrollmentInfo: {} })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("phoneSessionInfo");
        const info = res.body.totpSessionInfo;
        expect(info.sharedSecretKey).to.match(/^[A-Z2-7]{32}$/);
        expect(info.verificationCodeLength).to.equal(6);
        expect(info.hashingAlgorithm).to.equal("SHA1");
        expect(info.periodSec).to.equal(30);
        expect(info.sessionInfo).to.be.a("string");
        expect(new Date(info.finalizeEnrollmentTime).getTime()).to.be.greaterThan(Date.now());
      });
  });

  it("should enroll a TOTP second factor with a valid code", async () => {
    const { idToken } = await registerVerifiedUser("alice@example.com");
    const { sessionInfo, sharedSecretKey } = await startTotpEnrollment(idToken);

    const res = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        displayName: "Authenticator app",
        totpVerificationInfo: { sessionInfo, verificationCode: generateTotpCode(sharedSecretKey) },
      });
    expectStatusCode(200, res);
    expect(res.body.idToken).to.be.a("string");
    expect(res.body.refreshToken).to.be.a("string");

    const userInfo = await getAccountInfoByIdToken(authApi(), res.body.idToken);
    expect(userInfo.mfaInfo).to.be.an("array").with.lengthOf(1);
    const enrollment = userInfo.mfaInfo![0];
    expect(enrollment.totpInfo).to.eql({});
    expect(enrollment.displayName).to.equal("Authenticator app");
    expect(enrollment).not.to.have.property("phoneInfo");
    // The shared secret must never be sent back to clients.
    expect(enrollment).not.to.have.property("emulatorTotpSecret");
    expect(JSON.stringify(userInfo)).not.to.contain(sharedSecretKey);

    const payload = decodeIdToken(res.body.idToken);
    expect(payload.firebase.sign_in_second_factor).to.equal("totp");
    expect(payload.firebase.second_factor_identifier).to.equal(enrollment.mfaEnrollmentId);

    // Enrollment sessions can only be used once.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken: res.body.idToken,
        totpVerificationInfo: { sessionInfo, verificationCode: generateTotpCode(sharedSecretKey) },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_SESSION_INFO");
      });
  });

  it("should error on mfaEnrollment:finalize if the TOTP code is wrong", async () => {
    const { idToken } = await registerVerifiedUser("alice@example.com");
    const { sessionInfo, sharedSecretKey } = await startTotpEnrollment(idToken);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        totpVerificationInfo: { sessionInfo, verificationCode: wrongCode(sharedSecretKey) },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_CODE");
      });

    const userInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(userInfo.mfaInfo || []).to.have.lengthOf(0);
  });

  it("should error on mfaEnrollment:finalize if the TOTP code has expired", async () => {
    const { idToken } = await registerVerifiedUser("alice@example.com");
    const { sessionInfo, sharedSecretKey } = await startTotpEnrollment(idToken);
    const verificationCode = generateTotpCode(sharedSecretKey);

    // Codes from up to 5 intervals before or after now are accepted by default.
    getClock().tick(6 * 30 * 1000);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({ idToken, totpVerificationInfo: { sessionInfo, verificationCode } })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_CODE");
      });
  });

  it("should use the configured adjacentIntervals", async () => {
    const { tenantId } = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      allowPasswordSignup: true,
      mfaConfig: {
        providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 0 } }],
      },
    });
    const { idToken } = await registerVerifiedUser("alice@example.com", tenantId);
    const start = await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken, tenantId, totpEnrollmentInfo: {} });
    expectStatusCode(200, start);
    const { sessionInfo, sharedSecretKey } = start.body.totpSessionInfo as {
      sessionInfo: string;
      sharedSecretKey: string;
    };
    const staleCode = generateTotpCode(sharedSecretKey);

    // With no adjacent intervals, a code from the previous interval is rejected
    // even though the default of 5 would accept it.
    getClock().tick(30 * 1000);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        tenantId,
        totpVerificationInfo: { sessionInfo, verificationCode: staleCode },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_CODE");
      });

    // The code for the current interval still works with the same session.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        tenantId,
        totpVerificationInfo: { sessionInfo, verificationCode: generateTotpCode(sharedSecretKey) },
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
      });
  });

  it("should error on mfaEnrollment:finalize with the session of another user", async () => {
    const alice = await registerVerifiedUser("alice@example.com");
    const bob = await registerVerifiedUser("bob@example.com");
    const { sessionInfo, sharedSecretKey } = await startTotpEnrollment(alice.idToken);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken: bob.idToken,
        totpVerificationInfo: { sessionInfo, verificationCode: generateTotpCode(sharedSecretKey) },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_SESSION_INFO");
      });
  });

  it("should error on TOTP requests if TOTP is not an enabled provider", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: { state: "ENABLED", enabledProviders: ["PHONE_SMS"] },
    });
    const requests: [string, Record<string, unknown>][] = [
      ["mfaEnrollment:start", { totpEnrollmentInfo: {} }],
      ["mfaEnrollment:finalize", { totpVerificationInfo: {} }],
      ["mfaSignIn:finalize", { totpVerificationInfo: {} }],
    ];
    for (const [method, body] of requests) {
      await authApi()
        .post(`/identitytoolkit.googleapis.com/v2/accounts/${method}`)
        .query({ key: "fake-api-key" })
        .send({ tenantId: tenant.tenantId, ...body })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error)
            .to.have.property("message")
            .equals("OPERATION_NOT_ALLOWED : TOTP based MFA not enabled.");
        });
    }
  });

  it("should sign in with a TOTP second factor", async () => {
    const email = "alice@example.com";
    const { idToken, localId } = await registerVerifiedUser(email);
    const { sharedSecretKey } = await enrollTotpMfa(authApi(), idToken);

    getClock().tick(30 * 1000);

    const { mfaPendingCredential, mfaEnrollmentId } = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email, password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        const mfaInfo = res.body.mfaInfo as MfaEnrollment[];
        expect(mfaInfo).to.be.an("array").with.lengthOf(1);
        expect(mfaInfo[0].totpInfo).to.eql({});
        expect(mfaInfo[0]).not.to.have.property("phoneInfo");
        expect(JSON.stringify(res.body)).not.to.contain(sharedSecretKey);
        return {
          mfaPendingCredential: res.body.mfaPendingCredential as string,
          mfaEnrollmentId: mfaInfo[0].mfaEnrollmentId,
        };
      });

    getClock().tick(5555);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({
        mfaPendingCredential,
        mfaEnrollmentId,
        totpVerificationInfo: { verificationCode: generateTotpCode(sharedSecretKey) },
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
        expect(res.body.refreshToken).to.be.a("string");
        const payload = decodeIdToken(res.body.idToken);
        expect(payload.firebase.sign_in_second_factor).to.equal("totp");
        expect(payload.firebase.second_factor_identifier).to.equal(mfaEnrollmentId);
      });

    const afterMfa = await getAccountInfoByLocalId(authApi(), localId);
    expect(afterMfa.lastLoginAt).to.equal(Date.now().toString());
  });

  it("should error on mfaSignIn:finalize with a wrong TOTP code or enrollment", async () => {
    const email = "alice@example.com";
    const { idToken } = await registerVerifiedUser(email);
    const { sharedSecretKey } = await enrollTotpMfa(authApi(), idToken);
    const { mfaPendingCredential, mfaEnrollmentId } = await signInWithPassword(
      authApi(),
      email,
      password,
      true,
    );

    const cases: [Record<string, unknown>, string][] = [
      [
        { mfaEnrollmentId, totpVerificationInfo: { verificationCode: wrongCode(sharedSecretKey) } },
        "INVALID_CODE",
      ],
      [
        { mfaEnrollmentId: "unknown", totpVerificationInfo: { verificationCode: "123456" } },
        "MFA_ENROLLMENT_NOT_FOUND",
      ],
      [
        { totpVerificationInfo: { verificationCode: "123456" } },
        "MISSING_MFA_ENROLLMENT_ID : No second factor identifier is provided.",
      ],
    ];
    for (const [body, message] of cases) {
      await authApi()
        .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
        .query({ key: "fake-api-key" })
        .send({ mfaPendingCredential, ...body })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error).to.have.property("message").equals(message);
        });
    }
  });

  it("should allow profile updates for a user with a TOTP second factor", async () => {
    const { idToken: firstToken, localId } = await registerVerifiedUser("alice@example.com");
    const { idToken } = await enrollTotpMfa(authApi(), firstToken);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, displayName: DISPLAY_NAME })
      .then((res) => expectStatusCode(200, res));
    await updateAccountByLocalId(authApi(), localId, { photoUrl: PHOTO_URL });

    const userInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(userInfo.displayName).to.equal(DISPLAY_NAME);
    expect(userInfo.photoUrl).to.equal(PHOTO_URL);
    expect(userInfo.mfaInfo).to.have.lengthOf(1);
  });

  it("should allow withdrawing a TOTP second factor", async () => {
    const email = "alice@example.com";
    const { idToken: firstToken } = await registerVerifiedUser(email);
    const { idToken } = await enrollTotpMfa(authApi(), firstToken);
    const { mfaInfo } = await getAccountInfoByIdToken(authApi(), idToken);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:withdraw")
      .query({ key: "fake-api-key" })
      .send({ idToken, mfaEnrollmentId: mfaInfo![0].mfaEnrollmentId })
      .then((res) => {
        expectStatusCode(200, res);
        expect(decodeIdToken(res.body.idToken).firebase).not.to.have.property(
          "sign_in_second_factor",
        );
      });

    const after = await getAccountInfoByIdToken(authApi(), idToken);
    expect(after.mfaInfo).to.have.lengthOf(0);
    const signIn = await signInWithPassword(authApi(), email, password);
    expect(signIn.idToken).to.be.a("string");
  });

  it("should keep TOTP sign in working after export and import", async () => {
    const email = "alice@example.com";
    const { idToken } = await registerVerifiedUser(email);
    const { sharedSecretKey } = await enrollTotpMfa(authApi(), idToken);

    // Export reads accounts with accounts:batchGet and import writes them back
    // with accounts:batchCreate.
    const users = await authApi()
      .get(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`)
      .query({ maxResults: -1 })
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.users as { mfaInfo: MfaEnrollment[] }[];
      });
    expect(users[0].mfaInfo[0].emulatorTotpSecret).to.equal(sharedSecretKey);

    await authApi()
      .delete(`/emulator/v1/projects/${PROJECT_ID}/accounts`)
      .send()
      .then((res) => expectStatusCode(200, res));
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({ users })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error || []).to.have.length(0);
      });

    const { mfaPendingCredential, mfaEnrollmentId } = await signInWithPassword(
      authApi(),
      email,
      password,
      true,
    );
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({
        mfaPendingCredential,
        mfaEnrollmentId,
        totpVerificationInfo: { verificationCode: generateTotpCode(sharedSecretKey) },
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(decodeIdToken(res.body.idToken).firebase.sign_in_second_factor).to.equal("totp");
      });
  });

  it("should not import a TOTP enrollment without its shared secret", async () => {
    await authApi()
      .post(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchCreate`)
      .set("Authorization", "Bearer owner")
      .send({
        users: [
          {
            localId: "totp-user",
            email: "alice@example.com",
            emailVerified: true,
            mfaInfo: [{ mfaEnrollmentId: "enrollment-id", totpInfo: {} }],
          },
        ],
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.error).to.eql([{ index: 0, message: "Second factor not supported." }]);
      });
  });

  it("should ask for the TOTP factor when TOTP is the only MFA provider", async () => {
    // Production enables TOTP through providerConfigs alone, so the top level
    // state stays DISABLED.
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      allowPasswordSignup: true,
      mfaConfig: { providerConfigs: [{ state: "ENABLED", totpProviderConfig: {} }] },
    });
    const { tenantId } = tenant;
    const email = "alice@example.com";
    const { idToken } = await registerVerifiedUser(email, tenantId);
    const { sharedSecretKey } = await enrollTotpMfa(authApi(), idToken, tenantId);

    const { mfaPendingCredential, mfaInfo } = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email, password, tenantId })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        return res.body as { mfaPendingCredential: string; mfaInfo: MfaEnrollment[] };
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({
        tenantId,
        mfaPendingCredential,
        mfaEnrollmentId: mfaInfo[0].mfaEnrollmentId,
        totpVerificationInfo: { verificationCode: generateTotpCode(sharedSecretKey) },
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
      });
  });
});
