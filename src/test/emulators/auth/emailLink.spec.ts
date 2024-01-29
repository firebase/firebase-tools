import { expect } from "chai";
import * as nock from "nock";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload, parseBlockingFunctionJwt } from "../../../emulator/auth/operations";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import {
  expectStatusCode,
  registerUser,
  signInWithPhoneNumber,
  updateAccountByLocalId,
  getSigninMethods,
  inspectOobs,
  createEmailSignInOob,
  TEST_PHONE_NUMBER,
  TEST_MFA_INFO,
  registerTenant,
  getAccountInfoByLocalId,
  updateConfig,
  BEFORE_CREATE_URL,
  BLOCKING_FUNCTION_HOST,
  BEFORE_CREATE_PATH,
  BEFORE_SIGN_IN_PATH,
  BEFORE_SIGN_IN_URL,
  DISPLAY_NAME,
  PHOTO_URL,
} from "./helpers";

describeAuthEmulator("email link sign-in", ({ authApi }) => {
  it("should send OOB code to new emails and create account on sign-in", async () => {
    const email = "alice@example.com";
    await createEmailSignInOob(authApi(), email);

    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(1);
    expect(oobs[0].email).to.equal(email);
    expect(oobs[0].requestType).to.equal("EMAIL_SIGNIN");

    // The returned oobCode can be redeemed to sign-in.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ oobCode: oobs[0].oobCode, email })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("idToken").that.is.a("string");
        expect(res.body.email).to.equal(email);
        expect(res.body.isNewUser).to.equal(true);

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.be.a("string");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password"); // The provider name is (confusingly) "password".
      });

    expect(await getSigninMethods(authApi(), email)).to.have.members(["emailLink"]);
  });

  it("should sign an existing account in and enable email-link sign-in for them", async () => {
    const user = { email: "bob@example.com", password: "notasecret" };
    const { localId, idToken } = await registerUser(authApi(), user);
    const { oobCode } = await createEmailSignInOob(authApi(), user.email);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, oobCode })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0]).to.have.property("emailLinkSignin").equal(true);
      });

    expect(await getSigninMethods(authApi(), user.email)).to.have.members([
      "password",
      "emailLink",
    ]);
  });

  it("should error on invalid oobCode", async () => {
    const email = "alice@example.com";
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email, oobCode: "invalid" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_OOB_CODE");
      });
  });

  it("should error if user is disabled", async () => {
    const { localId, email } = await registerUser(authApi(), {
      email: "bob@example.com",
      password: "notasecret",
    });
    const { oobCode } = await createEmailSignInOob(authApi(), email);
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email, oobCode })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("USER_DISABLED");
      });
  });

  it("should error if email mismatches", async () => {
    const { oobCode } = await createEmailSignInOob(authApi(), "alice@example.com");

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email: "NOT-alice@example.com", oobCode })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal(
          "INVALID_EMAIL : The email provided does not match the sign-in email address.",
        );
      });
  });

  it("should link existing account with idToken to new email", async () => {
    const oldEmail = "bob@example.com";
    const newEmail = "alice@example.com";
    const { localId, idToken } = await registerUser(authApi(), {
      email: oldEmail,
      password: "notasecret",
    });
    const { oobCode } = await createEmailSignInOob(authApi(), newEmail);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email: newEmail, oobCode, idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
        expect(res.body.email).to.equal(newEmail);
      });

    expect(await getSigninMethods(authApi(), newEmail)).to.have.members(["password", "emailLink"]);
    expect(await getSigninMethods(authApi(), oldEmail)).to.be.empty;
  });

  it("should link existing phone-auth account to new email", async () => {
    const { localId, idToken } = await signInWithPhoneNumber(authApi(), TEST_PHONE_NUMBER);
    const email = "alice@example.com";
    const { oobCode } = await createEmailSignInOob(authApi(), email);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email, oobCode, idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
        expect(res.body.email).to.equal(email);
      });

    // Sign-in methods should not contain "phone", since phone sign-in is not
    // associated with an email address.
    expect(await getSigninMethods(authApi(), email)).to.have.members(["emailLink"]);
  });

  it("should error when trying to link an email already used in another account", async () => {
    const { idToken } = await signInWithPhoneNumber(authApi(), TEST_PHONE_NUMBER);
    const email = "alice@example.com";
    await registerUser(authApi(), { email, password: "notasecret" });
    const { oobCode } = await createEmailSignInOob(authApi(), email);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email, oobCode, idToken })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_EXISTS");
      });
  });

  it("should error if user to be linked is disabled", async () => {
    const { email, localId, idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    const { oobCode } = await createEmailSignInOob(authApi(), email);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email, oobCode, idToken })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
      });
  });

  it("should return pending credential if user has MFA", async () => {
    const user = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
    };
    const { idToken, email } = await registerUser(authApi(), user);
    const { oobCode } = await createEmailSignInOob(authApi(), email);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email, oobCode, idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        expect(res.body.mfaPendingCredential).to.be.a("string");
        expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
      });
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("PROJECT_DISABLED");
      });
  });

  it("should error if email link sign in is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      enableEmailLinkSignin: false,
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("OPERATION_NOT_ALLOWED");
      });
  });

  it("should create account on sign-in with tenantId", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      enableEmailLinkSignin: true,
    });
    const email = "alice@example.com";
    const { oobCode } = await createEmailSignInOob(authApi(), email, tenant.tenantId);

    const localId = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ oobCode, email, tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.localId;
      });

    const user = await getAccountInfoByLocalId(authApi(), localId, tenant.tenantId);
    expect(user.tenantId).to.eql(tenant.tenantId);
  });

  it("should return pending credential if user has MFA and enabled on tenant projects", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      enableEmailLinkSignin: true,
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
    const { idToken, email } = await registerUser(authApi(), user);
    const { oobCode } = await createEmailSignInOob(authApi(), email, tenant.tenantId);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email, oobCode, idToken, tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        expect(res.body.mfaPendingCredential).to.be.a("string");
        expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
      });
  });

  describe("when blocking functions are present", () => {
    afterEach(() => {
      expect(nock.isDone()).to.be.true;
      nock.cleanAll();
    });

    it("should update modifiable fields for account creation", async () => {
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

      const email = "alice@example.com";
      await createEmailSignInOob(authApi(), email);
      const oobs = await inspectOobs(authApi());
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("idToken").that.is.a("string");
          expect(res.body.email).to.equal(email);
          expect(res.body.isNewUser).to.equal(true);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
        });
    });

    it("should pass user info in the request body to beforeCreate", async () => {
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
      let jwtStr;
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_CREATE_PATH, (parsedBody) => {
          jwtStr = parsedBody.data.jwt;
          return parsedBody;
        })
        .reply(200, {
          userRecord: {
            updateMask: "displayName",
            displayName: "Not tested",
          },
        });

      const email = "alice@example.com";
      await createEmailSignInOob(authApi(), email);
      const oobs = await inspectOobs(authApi());

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(200, res);
        });

      expect(jwtStr).not.to.be.undefined;
      const jwt = parseBlockingFunctionJwt(jwtStr as unknown as string);
      expect(jwt).to.have.property("sign_in_method").eql("emailLink");
      expect(jwt.user_record).to.have.property("uid").that.is.a("string");
      expect(jwt.user_record).to.have.property("email").eql(email);
      expect(jwt.user_record).to.have.property("email_verified").to.be.true;
      expect(jwt.user_record).to.have.property("metadata");
      expect(jwt.user_record.metadata).to.have.property("creation_time").that.is.a("string");
    });

    it("should pass user info in the request body to beforeSignIn", async () => {
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
      let jwtStr;
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_SIGN_IN_PATH, (parsedBody) => {
          jwtStr = parsedBody.data.jwt;
          return parsedBody;
        })
        .reply(200, {
          userRecord: {
            updateMask: "displayName",
            displayName: "Not tested",
          },
        });

      const email = "alice@example.com";
      await createEmailSignInOob(authApi(), email);
      const oobs = await inspectOobs(authApi());

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(200, res);
        });

      expect(jwtStr).not.to.be.undefined;
      const jwt = parseBlockingFunctionJwt(jwtStr as unknown as string);
      expect(jwt).to.have.property("sign_in_method").eql("emailLink");
      expect(jwt.user_record).to.have.property("uid").that.is.a("string");
      expect(jwt.user_record).to.have.property("email").eql(email);
      expect(jwt.user_record).to.have.property("email_verified").to.be.true;
      expect(jwt.user_record).to.have.property("metadata");
      expect(jwt.user_record.metadata).to.have.property("creation_time").that.is.a("string");
    });

    it("should pass user info in the request body to beforeSignIn and include modifiable fields from beforeCreate", async () => {
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
      let jwtStr;
      nock(BLOCKING_FUNCTION_HOST)
        .post(BEFORE_CREATE_PATH)
        .reply(200, {
          userRecord: {
            updateMask: "displayName,photoUrl,emailVerified,customClaims",
            displayName: DISPLAY_NAME,
            photoUrl: PHOTO_URL,
            emailVerified: false,
            customClaims: { customAttribute: "custom" },
          },
        })
        .post(BEFORE_SIGN_IN_PATH, (parsedBody) => {
          jwtStr = parsedBody.data.jwt;
          return parsedBody;
        })
        .reply(200, {
          userRecord: {
            updateMask: "displayName",
            displayName: "Not tested",
          },
        });

      const email = "alice@example.com";
      await createEmailSignInOob(authApi(), email);
      const oobs = await inspectOobs(authApi());

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(200, res);
        });

      expect(jwtStr).not.to.be.undefined;
      const jwt = parseBlockingFunctionJwt(jwtStr as unknown as string);
      expect(jwt).to.have.property("sign_in_method").eql("emailLink");
      expect(jwt.user_record).to.have.property("uid").that.is.a("string");
      expect(jwt.user_record).to.have.property("email").eql(email);
      expect(jwt.user_record).to.have.property("email_verified").to.be.false;
      expect(jwt.user_record).to.have.property("display_name").eql(DISPLAY_NAME);
      expect(jwt.user_record).to.have.property("photo_url").eql(PHOTO_URL);
      expect(jwt.user_record).to.have.property("custom_claims").eql({ customAttribute: "custom" });
      expect(jwt.user_record).to.have.property("metadata");
      expect(jwt.user_record.metadata).to.have.property("creation_time").that.is.a("string");
    });

    it("should update modifiable fields before sign in", async () => {
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
      const email = "alice@example.com";
      await createEmailSignInOob(authApi(), email);
      const oobs = await inspectOobs(authApi());

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("idToken").that.is.a("string");
          expect(res.body.email).to.equal(email);
          expect(res.body.isNewUser).to.equal(true);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;

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
      const email = "alice@example.com";
      await createEmailSignInOob(authApi(), email);
      const oobs = await inspectOobs(authApi());

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("idToken").that.is.a("string");
          expect(res.body.email).to.equal(email);
          expect(res.body.isNewUser).to.equal(true);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
          expect(decoded!.payload).to.have.property("sessionAttribute").equals("session");
        });
    });

    it("should update modifiable fields before sign in for existing accounts", async () => {
      const user = { email: "bob@example.com", password: "notasecret" };
      const { localId } = await registerUser(authApi(), user);
      const { oobCode } = await createEmailSignInOob(authApi(), user.email);
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

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ email: user.email, oobCode })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.localId).to.equal(localId);
          expect(res.body).to.have.property("idToken").that.is.a("string");
          expect(res.body.email).to.equal(user.email);
          expect(res.body.isNewUser).to.equal(false);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
          expect(decoded!.payload).to.have.property("sessionAttribute").equals("session");
        });
    });

    it("should error after disabling user", async () => {
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
      const email = "alice@example.com";
      await createEmailSignInOob(authApi(), email);
      const oobs = await inspectOobs(authApi());

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
        .query({ key: "fake-api-key" })
        .send({ oobCode: oobs[0].oobCode, email })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });
  });
});
