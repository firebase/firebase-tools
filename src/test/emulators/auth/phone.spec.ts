import { expect } from "chai";
import * as nock from "nock";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import {
  expectStatusCode,
  registerAnonUser,
  signInWithPhoneNumber,
  updateAccountByLocalId,
  inspectVerificationCodes,
  registerUser,
  TEST_MFA_INFO,
  TEST_PHONE_NUMBER,
  TEST_PHONE_NUMBER_2,
  enrollPhoneMfa,
  registerTenant,
  updateConfig,
  BEFORE_CREATE_PATH,
  BEFORE_CREATE_URL,
  BLOCKING_FUNCTION_HOST,
  DISPLAY_NAME,
  PHOTO_URL,
  BEFORE_SIGN_IN_PATH,
  BEFORE_SIGN_IN_URL,
} from "./helpers";

describeAuthEmulator("phone auth sign-in", ({ authApi }) => {
  it("should return fake recaptcha params", async () => {
    await authApi()
      .get("/identitytoolkit.googleapis.com/v1/recaptchaParams")
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("recaptchaStoken").that.is.a("string");
        expect(res.body).to.have.property("recaptchaSiteKey").that.is.a("string");
      });
  });

  it("should pretend to send a verification code via SMS", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;

    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("sessionInfo").that.is.a("string");
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    expect(codes).to.have.length(1);
    expect(codes[0].phoneNumber).to.equal(phoneNumber);
    expect(codes[0].sessionInfo).to.equal(sessionInfo);
    expect(codes[0].code).to.be.a("string");
  });

  it("should error when phone number is missing when calling sendVerificationCode", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ recaptchaToken: "ignored" /* no phone number */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          // This matches the production behavior. For some reason, it's not MISSING_PHONE_NUMBER.
          .equals("INVALID_PHONE_NUMBER : Invalid format.");
      });
  });

  it("should error when phone number is invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ recaptchaToken: "ignored", phoneNumber: "invalid" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("INVALID_PHONE_NUMBER : Invalid format.");
      });
  });

  it("should error on sendVerificationCode if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error on sendVerificationCode for tenant projects", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: false });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("UNSUPPORTED_TENANT_OPERATION");
      });
  });

  it("should create new account by verifying phone number", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;

    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    const code = codes[0].code;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo, code })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("isNewUser").equals(true);
        expect(res.body).to.have.property("phoneNumber").equals(phoneNumber);

        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.be.a("string");
        expect(decoded!.payload.phone_number).to.equal(phoneNumber);
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("phone");
        expect(decoded!.payload.firebase.identities).to.eql({ phone: [phoneNumber] });
      });
  });

  it("should error when sessionInfo or code is missing for signInWithPhoneNumber", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ code: "123456" /* no sessionInfo */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_SESSION_INFO");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo: "something-something" /* no code */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_CODE");
      });
  });

  it("should error when sessionInfo or code is invalid", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;

    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    const code = codes[0].code;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo: "totally-invalid", code })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_SESSION_INFO");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      // Try to send the code but with an extra "1" appended.
      // This is definitely invalid since we won't have another pending code.
      .send({ sessionInfo, code: code + "1" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_CODE");
      });
  });

  it("should error if user is disabled", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    const { localId } = await signInWithPhoneNumber(authApi(), phoneNumber);
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    const code = codes[0].code;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo, code })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
      });
  });

  it("should link phone number to existing account by idToken", async () => {
    const { localId, idToken } = await registerAnonUser(authApi());

    const phoneNumber = TEST_PHONE_NUMBER;
    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    const code = codes[0].code;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo, code, idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("isNewUser").equals(false);
        expect(res.body).to.have.property("phoneNumber").equals(phoneNumber);
        expect(res.body.localId).to.equal(localId);
      });
  });

  it("should error if user to be linked is disabled", async () => {
    const { localId, idToken } = await registerAnonUser(authApi());
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    const phoneNumber = TEST_PHONE_NUMBER;
    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    const code = codes[0].code;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo, code, idToken })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
      });
  });

  it("should error when linking phone number to existing user with MFA", async () => {
    const user = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
    };
    const { idToken } = await registerUser(authApi(), user);

    const phoneNumber = TEST_PHONE_NUMBER;
    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.sessionInfo as string;
      });

    const codes = await inspectVerificationCodes(authApi());
    const code = codes[0].code;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo, code, idToken })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal(
          "UNSUPPORTED_FIRST_FACTOR : A phone number cannot be set as a first factor on an SMS based MFA user.",
        );
      });
  });

  it("should error if user has MFA", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    let { idToken, localId } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });
    await updateAccountByLocalId(authApi(), localId, {
      emailVerified: true,
      phoneNumber,
    });
    ({ idToken } = await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER_2));

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal(
          "UNSUPPORTED_FIRST_FACTOR : A phone number cannot be set as a first factor on an SMS based MFA user.",
        );
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    expect(codes).to.be.empty;
  });

  it("should return temporaryProof if phone number already belongs to another account", async () => {
    // Given a phone number that is already registered...
    const phoneNumber = TEST_PHONE_NUMBER;
    await signInWithPhoneNumber(authApi(), phoneNumber);

    const { idToken } = await registerAnonUser(authApi());

    const sessionInfo = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
      .query({ key: "fake-api-key" })
      .send({ phoneNumber, recaptchaToken: "ignored" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.sessionInfo;
      });

    const codes = await inspectVerificationCodes(authApi());
    const code = codes[0].code;

    const temporaryProof = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ sessionInfo, code, idToken })
      .then((res) => {
        expectStatusCode(200, res);
        // The linking will fail, but a successful response is still returned
        // with a temporaryProof (so that clients may call this API again
        // without having to verify the phone number again).
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).to.have.property("phoneNumber").equals(phoneNumber);
        expect(res.body.temporaryProof).to.be.a("string");
        return res.body.temporaryProof;
      });

    // When called again with the returned temporaryProof, the real error
    // message should now be returned.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ idToken, phoneNumber, temporaryProof })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PHONE_NUMBER_EXISTS");
      });
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error if called on tenant project", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: false });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("UNSUPPORTED_TENANT_OPERATION");
      });
  });

  describe("when blocking functions are present", () => {
    afterEach(() => {
      expect(nock.isDone()).to.be.true;
      nock.cleanAll();
    });

    it("should update modifiable fields for new users", async () => {
      await updateConfig(
        authApi(),
        PROJECT_ID,
        {
          blockingFunctions: {
            triggers: {
              beforeCreate: {
                functionUri: BEFORE_CREATE_URL,
              },
            },
          },
        },
        "blockingFunctions",
      );
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_CREATE_PATH)
        .reply(200, {
          userRecord: {
            updateMask: "displayName,photoUrl,emailVerified,customClaims",
            displayName: DISPLAY_NAME,
            photoUrl: PHOTO_URL,
            emailVerified: true,
            customClaims: { customAttribute: "custom" },
          },
        });
      const phoneNumber = TEST_PHONE_NUMBER;
      const sessionInfo = await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });
      const codes = await inspectVerificationCodes(authApi());
      const code = codes[0].code;

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("isNewUser").equals(true);
          expect(res.body).to.have.property("phoneNumber").equals(phoneNumber);
          expect(res.body).to.have.property("refreshToken").that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
        });
    });

    it("should update modifiable fields for existing users", async () => {
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
      const phoneNumber = TEST_PHONE_NUMBER;
      const sessionInfo = await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });
      const codes = await inspectVerificationCodes(authApi());
      const code = codes[0].code;

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("isNewUser").equals(true);
          expect(res.body).to.have.property("phoneNumber").equals(phoneNumber);
          expect(res.body).to.have.property("refreshToken").that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
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
    });

    it("beforeSignIn fields should overwrite beforeCreate fields", async () => {
      await updateConfig(
        authApi(),
        PROJECT_ID,
        {
          blockingFunctions: {
            triggers: {
              beforeCreate: {
                functionUri: BEFORE_CREATE_URL,
              },
              beforeSignIn: {
                functionUri: BEFORE_SIGN_IN_URL,
              },
            },
          },
        },
        "blockingFunctions",
      );
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_CREATE_PATH)
        .reply(200, {
          userRecord: {
            updateMask: "displayName,photoUrl,emailVerified,customClaims",
            displayName: "oldDisplayName",
            photoUrl: "oldPhotoUrl",
            emailVerified: false,
            customClaims: { customAttribute: "oldCustom" },
          },
        })
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
      const phoneNumber = TEST_PHONE_NUMBER;
      const sessionInfo = await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });
      const codes = await inspectVerificationCodes(authApi());
      const code = codes[0].code;

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("isNewUser").equals(true);
          expect(res.body).to.have.property("phoneNumber").equals(phoneNumber);
          expect(res.body).to.have.property("refreshToken").that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
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
    });

    it("should disable user if set", async () => {
      await updateConfig(
        authApi(),
        PROJECT_ID,
        {
          blockingFunctions: {
            triggers: {
              beforeCreate: {
                functionUri: BEFORE_CREATE_URL,
              },
            },
          },
        },
        "blockingFunctions",
      );
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_CREATE_PATH)
        .reply(200, {
          userRecord: {
            updateMask: "disabled",
            disabled: true,
          },
        });
      const phoneNumber = TEST_PHONE_NUMBER;
      const sessionInfo = await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode")
        .query({ key: "fake-api-key" })
        .send({ phoneNumber, recaptchaToken: "ignored" })
        .then((res) => {
          expectStatusCode(200, res);
          return res.body.sessionInfo;
        });
      const codes = await inspectVerificationCodes(authApi());

      return authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber")
        .query({ key: "fake-api-key" })
        .send({ sessionInfo, code: codes[0].code })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
        });
    });
  });
});
