import { expect } from "chai";
import * as nock from "nock";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import {
  expectStatusCode,
  getAccountInfoByIdToken,
  getAccountInfoByLocalId,
  registerUser,
  signInWithFakeClaims,
  registerAnonUser,
  signInWithPhoneNumber,
  updateAccountByLocalId,
  getSigninMethods,
  TEST_MFA_INFO,
  TEST_PHONE_NUMBER,
  TEST_PHONE_NUMBER_2,
  TEST_INVALID_PHONE_NUMBER,
  registerTenant,
  updateConfig,
  BLOCKING_FUNCTION_HOST,
  BEFORE_CREATE_PATH,
  BEFORE_CREATE_URL,
  BEFORE_SIGN_IN_URL,
  BEFORE_SIGN_IN_PATH,
  DISPLAY_NAME,
  PHOTO_URL,
} from "./helpers";

describeAuthEmulator("accounts:signUp", ({ authApi }) => {
  it("should throw error if no email provided", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ password: "notasecret" /* no email */ })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_EMAIL");
      });
  });

  it("should throw error if empty email and password is provided", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email: "", password: "" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_EMAIL");
      });
  });

  it("should issue idToken and refreshToken on anon signUp", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ returnSecureToken: true })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.be.a("string");
        expect(decoded!.payload.provider_id).equals("anonymous");
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("anonymous");
      });
  });

  it("should issue refreshToken on email+password signUp", async () => {
    const email = "me@example.com";
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email, password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.be.a("string");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
        expect(decoded!.payload.firebase.identities).to.eql({
          email: [email],
        });
      });
  });

  it("should ignore displayName and photoUrl for new anon account", async () => {
    const user = {
      displayName: "Me",
      photoUrl: "http://localhost/my-profile.png",
    };
    const idToken = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send(user)
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.displayName).to.be.undefined;
        expect(res.body.photoUrl).to.be.undefined;
        return res.body.idToken;
      });
    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.displayName).to.be.undefined;
    expect(info.photoUrl).to.be.undefined;
  });

  it("should set displayName but ignore photoUrl for new password account", async () => {
    const user = {
      email: "me@example.com",
      password: "notasecret",
      displayName: "Me",
      photoUrl: "http://localhost/my-profile.png",
    };
    const idToken = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send(user)
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.displayName).to.equal(user.displayName);
        expect(res.body.photoUrl).to.be.undefined;
        return res.body.idToken;
      });
    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.displayName).to.equal(user.displayName);
    expect(info.photoUrl).to.be.undefined;
  });

  it("should disallow duplicate email signUp", async () => {
    const user = { email: "bob@example.com", password: "notasecret" };
    await registerUser(authApi(), user);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email: user.email, password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_EXISTS");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      // Case variants of a same email address are also considered duplicates.
      .send({ email: "BOB@example.com", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_EXISTS");
      });
  });

  it("should error if another account exists with same email from IDP", async () => {
    const email = "alice@example.com";
    await signInWithFakeClaims(authApi(), "google.com", { sub: "123", email });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email, password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_EXISTS");
      });
  });

  it("should error when email format is invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email: "not.an.email.address.at.all", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("INVALID_EMAIL");
      });
  });

  it("should normalize email address to all lowercase", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email: "AlIcE@exAMPle.COM", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).equals("alice@example.com");
      });
  });

  it("should error when password is too short", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email: "me@example.com", password: "short" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .that.satisfy((str: string) => str.startsWith("WEAK_PASSWORD"));
      });
  });

  it("should error when idToken is provided but email / password is not", async () => {
    const { idToken } = await registerAnonUser(authApi());
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ idToken /* no email / password */ })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_EMAIL");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ idToken, email: "alice@example.com" /* no password */ })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_PASSWORD");
      });
  });

  it("should link email and password to anon user if idToken is provided", async () => {
    const { idToken, localId } = await registerAnonUser(authApi());
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ idToken, email: "alice@example.com", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
      });
  });

  it("should link email and password to phone sign-in user", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    const email = "alice@example.com";

    const { idToken, localId } = await signInWithPhoneNumber(authApi(), phoneNumber);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ idToken, email, password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");

        // The result account should have both phone and email.
        expect(decoded!.payload.firebase.identities).to.eql({
          phone: [phoneNumber],
          email: [email],
        });
      });
  });

  it("should error if account to be linked is disabled", async () => {
    const { idToken, localId } = await registerAnonUser(authApi());
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ idToken, email: "alice@example.com", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("USER_DISABLED");
      });
  });

  it("should replace existing email / password in linked account", async () => {
    const oldEmail = "alice@example.com";
    const newEmail = "bob@example.com";
    const oldPassword = "notasecret";
    const newPassword = "notasecret2";

    const { idToken, localId } = await registerUser(authApi(), {
      email: oldEmail,
      password: oldPassword,
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ idToken, email: newEmail, password: newPassword })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
        expect(res.body.email).to.equal(newEmail);
        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.payload.email).to.equal(newEmail);
        expect(decoded!.payload.firebase.identities).to.eql({
          email: [newEmail],
        });
      });

    const oldEmailSignInMethods = await getSigninMethods(authApi(), oldEmail);
    expect(oldEmailSignInMethods).to.be.empty;
  });

  it("should create new account with phone number when authenticated", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    const displayName = "Alice";
    const localId = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .set("Authorization", "Bearer owner")
      .send({ phoneNumber, displayName })
      .then((res) => {
        expectStatusCode(200, res);

        // Shouldn't be set for authenticated requests:
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");

        expect(res.body.displayName).to.equal(displayName);
        expect(res.body.localId).to.be.a("string").and.not.empty;
        return res.body.localId as string;
      });

    // This should sign into the same user.
    const phoneAuth = await signInWithPhoneNumber(authApi(), phoneNumber);
    expect(phoneAuth.localId).to.equal(localId);

    const info = await getAccountInfoByIdToken(authApi(), phoneAuth.idToken);
    expect(info.displayName).to.equal(displayName); // should already be set.
  });

  it("should error when extra localId parameter is provided", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .query({ key: "fake-api-key" })
      .send({ localId: "anything" /* cannot be specified since this is unauthenticated */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("UNEXPECTED_PARAMETER : User ID");
      });

    const { idToken, localId } = await registerAnonUser(authApi());
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .set("Authorization", "Bearer owner")
      .send({
        idToken,
        localId,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("UNEXPECTED_PARAMETER : User ID");
      });
  });

  it("should create new account with specified localId when authenticated", async () => {
    const localId = "haha";
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .set("Authorization", "Bearer owner")
      .send({ localId })
      .then((res) => {
        expectStatusCode(200, res);

        // Shouldn't be set for authenticated requests:
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");

        expect(res.body.localId).to.equal(localId);
      });
  });

  it("should error when creating new user with duplicate localId", async () => {
    const { localId } = await registerAnonUser(authApi());
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .set("Authorization", "Bearer owner")
      .send({ localId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("DUPLICATE_LOCAL_ID");
      });
  });

  it("should error if phone number is invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .set("Authorization", "Bearer owner")
      .send({ phoneNumber: TEST_INVALID_PHONE_NUMBER })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_PHONE_NUMBER : Invalid format.");
      });
  });

  it("should create new account with multi factor info", async () => {
    const user = { email: "alice@example.com", password: "notasecret", mfaInfo: [TEST_MFA_INFO] };
    const { localId } = await registerUser(authApi(), user);
    const info = await getAccountInfoByLocalId(authApi(), localId);
    expect(info.mfaInfo).to.have.length(1);
    const savedMfaInfo = info.mfaInfo![0];
    expect(savedMfaInfo).to.include(TEST_MFA_INFO);
    expect(savedMfaInfo?.mfaEnrollmentId).to.be.a("string").and.not.empty;
  });

  it("should create new account with two MFA factors", async () => {
    const user = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO, { ...TEST_MFA_INFO, phoneInfo: TEST_PHONE_NUMBER_2 }],
    };
    const { localId } = await registerUser(authApi(), user);
    const info = await getAccountInfoByLocalId(authApi(), localId);
    expect(info.mfaInfo).to.have.length(2);
    for (const savedMfaInfo of info.mfaInfo!) {
      if (savedMfaInfo.phoneInfo !== TEST_MFA_INFO.phoneInfo) {
        expect(savedMfaInfo.phoneInfo).to.eq(TEST_PHONE_NUMBER_2);
      } else {
        expect(savedMfaInfo).to.include(TEST_MFA_INFO);
      }
      expect(savedMfaInfo.mfaEnrollmentId).to.be.a("string").and.not.empty;
    }
  });

  it("should de-duplicate factors with the same info on create", async () => {
    const alice = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO, TEST_MFA_INFO, TEST_MFA_INFO],
    };
    const { localId: aliceLocalId } = await registerUser(authApi(), alice);
    const aliceInfo = await getAccountInfoByLocalId(authApi(), aliceLocalId);
    expect(aliceInfo.mfaInfo).to.have.length(1);
    expect(aliceInfo.mfaInfo![0]).to.include(TEST_MFA_INFO);
    expect(aliceInfo.mfaInfo![0].mfaEnrollmentId).to.be.a("string").and.not.empty;

    const bob = {
      email: "bob@example.com",
      password: "notasecret",
      mfaInfo: [
        TEST_MFA_INFO,
        TEST_MFA_INFO,
        TEST_MFA_INFO,
        { ...TEST_MFA_INFO, phoneInfo: TEST_PHONE_NUMBER_2 },
      ],
    };
    const { localId: bobLocalId } = await registerUser(authApi(), bob);
    const bobInfo = await getAccountInfoByLocalId(authApi(), bobLocalId);
    expect(bobInfo.mfaInfo).to.have.length(2);
    for (const savedMfaInfo of bobInfo.mfaInfo!) {
      if (savedMfaInfo.phoneInfo !== TEST_MFA_INFO.phoneInfo) {
        expect(savedMfaInfo.phoneInfo).to.eq(TEST_PHONE_NUMBER_2);
      } else {
        expect(savedMfaInfo).to.include(TEST_MFA_INFO);
      }
      expect(savedMfaInfo.mfaEnrollmentId).to.be.a("string").and.not.empty;
    }
  });

  it("does not require a display name for multi factor info", async () => {
    const mfaInfo = { phoneInfo: TEST_PHONE_NUMBER };
    const user = { email: "alice@example.com", password: "notasecret", mfaInfo: [mfaInfo] };
    const { localId } = await registerUser(authApi(), user);

    const info = await getAccountInfoByLocalId(authApi(), localId);
    expect(info.mfaInfo).to.have.length(1);
    const savedMfaInfo = info.mfaInfo![0];
    expect(savedMfaInfo).to.include(mfaInfo);
    expect(savedMfaInfo.mfaEnrollmentId).to.be.a("string").and.not.empty;
    expect(savedMfaInfo.displayName).to.be.undefined;
  });

  it("should error if multi factor phone number is invalid", async () => {
    const mfaInfo = { phoneInfo: TEST_INVALID_PHONE_NUMBER };
    const user = { email: "alice@example.com", password: "notasecret", mfaInfo: [mfaInfo] };
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .set("Authorization", "Bearer owner")
      .send(user)
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_MFA_PHONE_NUMBER : Invalid format.");
      });
  });

  it("should ignore if multi factor enrollment ID is specified on create", async () => {
    const mfaEnrollmentId1 = "thisShouldBeIgnored1";
    const mfaEnrollmentId2 = "thisShouldBeIgnored2";
    const user = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [
        {
          ...TEST_MFA_INFO,
          mfaEnrollmentId: mfaEnrollmentId1,
        },
        {
          ...TEST_MFA_INFO,
          mfaEnrollmentId: mfaEnrollmentId2,
        },
      ],
    };
    const { localId } = await registerUser(authApi(), user);
    const info = await getAccountInfoByLocalId(authApi(), localId);
    expect(info.mfaInfo).to.have.length(1);
    const savedMfaInfo = info.mfaInfo![0];
    expect(savedMfaInfo).to.include(TEST_MFA_INFO);
    expect(savedMfaInfo.mfaEnrollmentId).to.be.a("string").and.not.empty;
    expect([mfaEnrollmentId1, mfaEnrollmentId2]).not.to.include(savedMfaInfo.mfaEnrollmentId);
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").includes("PROJECT_DISABLED");
      });
  });

  it("should error if password sign up is not allowed", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { allowPasswordSignup: false });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId, email: "me@example.com", password: "notasecret" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").includes("OPERATION_NOT_ALLOWED");
      });
  });

  it("should error if anonymous user is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { enableAnonymousUser: false });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId, returnSecureToken: true })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").includes("ADMIN_ONLY_OPERATION");
      });
  });

  it("should create new account with tenant info", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { allowPasswordSignup: true });
    const user = { tenantId: tenant.tenantId, email: "alice@example.com", password: "notasecret" };

    const localId = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .query({ key: "fake-api-key" })
      .send(user)
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.localId;
      });
    const info = await getAccountInfoByLocalId(authApi(), localId, tenant.tenantId);

    expect(info.tenantId).to.eql(tenant.tenantId);
  });

  describe("when blocking functions are present", () => {
    afterEach(() => {
      expect(nock.isDone()).to.be.true;
      nock.cleanAll();
    });

    it("should update modifiable fields with beforeCreate response for a new email/password user", async () => {
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

      const email = "me@example.com";
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email, password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("refreshToken").that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
          expect(decoded!.payload.firebase.identities).to.eql({
            email: [email],
          });

          expect(res.body.displayName).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
        });
    });

    it("should update modifiable fields with beforeSignIn response for a new email/password user", async () => {
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

      const email = "me@example.com";
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email, password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("refreshToken").that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
          expect(decoded!.payload.firebase.identities).to.eql({
            email: [email],
          });

          expect(res.body.displayName).to.equal(DISPLAY_NAME);
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

      const email = "me@example.com";
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email, password: "notasecret" })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body).to.have.property("refreshToken").that.is.a("string");

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
          expect(decoded!.payload.firebase.identities).to.eql({
            email: [email],
          });

          expect(res.body.displayName).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
          expect(decoded!.payload).to.have.property("sessionAttribute").equals("session");
        });
    });

    it("should disable new user if set", async () => {
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

      const email = "me@example.com";
      const password = "notasecret";
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .send({ email, password })
        .query({ key: "fake-api-key" })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });

    it("should not trigger blocking functions for privileged requests", async () => {
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
        .reply(400)
        .post(BEFORE_SIGN_IN_PATH)
        .reply(400);

      const phoneNumber = TEST_PHONE_NUMBER;
      const displayName = "Alice";
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
        .set("Authorization", "Bearer owner")
        .send({ phoneNumber, displayName })
        .then((res) => {
          expectStatusCode(200, res);

          // Shouldn't be set for authenticated requests:
          expect(res.body).not.to.have.property("idToken");
          expect(res.body).not.to.have.property("refreshToken");

          expect(res.body.displayName).to.equal(displayName);
          expect(res.body.localId).to.be.a("string").and.not.empty;
        });

      // Shouldn't trigger nock calls
      expect(nock.isDone()).to.be.false;
      nock.cleanAll();
    });
  });
});
