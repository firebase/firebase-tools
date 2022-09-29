import { expect } from "chai";
import * as nock from "nock";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import {
  BEFORE_SIGN_IN_PATH,
  BEFORE_SIGN_IN_URL,
  BLOCKING_FUNCTION_HOST,
  DISPLAY_NAME,
  enrollPhoneMfa,
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
} from "./helpers";
import { MfaEnrollment } from "../../../emulator/auth/types";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";

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
          "UNVERIFIED_EMAIL : Need to verify email first before enrolling second factors."
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

    const decoded = decodeJwt(res.body.idToken, { complete: true }) as {
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
          "SECOND_FACTOR_EXISTS : Phone number already enrolled as second factor for this account."
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
          "UNSUPPORTED_FIRST_FACTOR : MFA is not available for the given first factor."
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

        const decoded = decodeJwt(res.body.idToken, { complete: true }) as {
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

        const decoded = decodeJwt(res.body.idToken, { complete: true }) as {
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
        "blockingFunctions"
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
        true
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
        "blockingFunctions"
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

          const decoded = decodeJwt(res.body.idToken, { complete: true }) as {
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
        true
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
        "blockingFunctions"
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
