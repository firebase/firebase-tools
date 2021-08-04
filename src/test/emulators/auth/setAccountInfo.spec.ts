import { expect } from "chai";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { ProviderUserInfo, PROVIDER_PASSWORD, PROVIDER_PHONE } from "../../../emulator/auth/state";
import { describeAuthEmulator } from "./setup";
import {
  expectStatusCode,
  getAccountInfoByIdToken,
  registerUser,
  signInWithFakeClaims,
  registerAnonUser,
  signInWithPhoneNumber,
  updateAccountByLocalId,
  getSigninMethods,
  signInWithEmailLink,
  inspectOobs,
  expectIdTokenExpired,
  TEST_MFA_INFO,
  TEST_PHONE_NUMBER,
  TEST_PHONE_NUMBER_2,
  TEST_PHONE_NUMBER_3,
  TEST_INVALID_PHONE_NUMBER,
  deleteAccount,
  updateProjectConfig,
} from "./helpers";

describeAuthEmulator("accounts:update", ({ authApi, getClock }) => {
  it("should allow updating and deleting displayName and photoUrl", async () => {
    const { idToken } = await registerAnonUser(authApi());

    const attrs = { displayName: "Alice", photoUrl: "http://localhost/alice.png" };
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, ...attrs })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.displayName).equals(attrs.displayName);
        expect(res.body.photoUrl).equals(attrs.photoUrl);

        // Updating name and picture shouldn't issue a new token.
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, deleteAttribute: ["DISPLAY_NAME", "PHOTO_URL"] })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("displayName");
        expect(res.body).not.to.have.property("photoUrl");
      });
  });

  it("should set password and issue new tokens", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId, idToken } = await registerUser(authApi(), user);
    const newPassword = "notasecreteither";

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, password: newPassword })
      .then((res) => {
        expectStatusCode(200, res);
        // Updating password causes new tokens to be issued.
        expect(res.body).to.have.property("refreshToken").that.is.a("string");
        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.equal(localId);
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
      });

    // New password now works.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: newPassword })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).equals(localId);
      });
  });

  it("should add password provider to anon user", async () => {
    const { localId, idToken } = await registerAnonUser(authApi());
    const email = "alice@example.com";
    const password = "notasecreteither";

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, email, password })
      .then((res) => {
        expectStatusCode(200, res);
        // Adding password causes new tokens to be issued.
        expect(res.body).to.have.property("refreshToken").that.is.a("string");
        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.equal(localId);
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
      });

    // New password now works.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email, password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).equals(localId);
      });

    expect(await getSigninMethods(authApi(), email)).to.eql(["password"]);
  });

  it("should allow adding email without password to anon user", async () => {
    const { localId, idToken } = await registerAnonUser(authApi());
    const email = "alice@example.com";

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, email })
      .then((res) => {
        expectStatusCode(200, res);
        // Setting email causes new tokens to be issued.
        expect(res.body).to.have.property("refreshToken").that.is.a("string");
        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.equal(localId);
        // This remains the same as provider used by the previous idToken.
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("anonymous");
      });

    expect(await getSigninMethods(authApi(), email)).not.to.contain(["password"]);
  });

  it("should allow changing email of an existing user, and send out an oob to reset the email", async () => {
    const oldEmail = "alice@example.com";
    const password = "notasecret";
    const newEmail = "bob@example.com";
    const { localId, idToken } = await registerUser(authApi(), { email: oldEmail, password });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, email: newEmail })
      .then((res) => {
        expectStatusCode(200, res);
        // Changing email causes new tokens to be issued.
        expect(res.body).to.have.property("refreshToken").that.is.a("string");
        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.equal(localId);
        expect(decoded!.payload.email).to.equal(newEmail);
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
      });

    // New email now works.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: newEmail, password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).equals(localId);
      });

    // Old email can no longer be used to sign in.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: oldEmail, password })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).equals("EMAIL_NOT_FOUND");
      });

    // An oob is sent to oldEmail
    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(1);
    expect(oobs[0].email).to.equal(oldEmail);
    expect(oobs[0].requestType).to.equal("RECOVER_EMAIL");
  });

  it("should disallow setting email to same as an existing user", async () => {
    const user = { email: "bob@example.com", password: "notasecret" };
    await registerUser(authApi(), user);
    const { idToken } = await registerAnonUser(authApi());

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .send({ idToken, email: user.email })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_EXISTS");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      // Case variants of a same email address are also considered duplicates.
      .send({ idToken, email: "BOB@example.com", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_EXISTS");
      });
  });

  it("should set initialEmail for the user, after updating email", async () => {
    const oldEmail = "alice@example.com";
    const password = "notasecret";
    const newEmail = "bob@example.com";
    const { idToken } = await registerUser(authApi(), { email: oldEmail, password });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, email: newEmail })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(newEmail);
      });

    // Verify that the initial email has been set.
    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.initialEmail).to.equal(oldEmail);
  });

  it("should reset email when OOB flow is initiated, after updating user email", async () => {
    const oldEmail = "alice@example.com";
    const password = "notasecret";
    const newEmail = "bob@example.com";
    const { idToken } = await registerUser(authApi(), { email: oldEmail, password });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, email: newEmail })
      .then((res) => {
        expectStatusCode(200, res);
      });

    // An oob is sent to the oldEmail
    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(1);
    expect(oobs[0].email).to.equal(oldEmail);
    expect(oobs[0].requestType).to.equal("RECOVER_EMAIL");

    // The returned oobCode can be redeemed to verify the email.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      // OOB code is enough, no idToken needed.
      .send({ oobCode: oobs[0].oobCode })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(oldEmail);
        // Email is verified since this flow can only be initiated through a link sent to the user's email.
        expect(res.body.emailVerified).to.equal(true);
      });

    // oobCode is removed after redeemed.
    const oobs2 = await inspectOobs(authApi());
    expect(oobs2).to.have.length(0);
  });

  it("should disallow resetting an email if another user exists with the same email", async () => {
    const userBob = { email: "bob@example.com", password: "notasecret" };
    const userOtherBob = { email: "bob@example.com", password: "notasecreteither" };
    const bobNewEmail = "bob_new@example.com";

    // Register first user
    const { idToken } = await registerUser(authApi(), userBob);

    // Update first user's email
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .send({ idToken, email: bobNewEmail })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(bobNewEmail);
      });

    // Register second user with the same email as the first user's initialEmail
    await registerUser(authApi(), userOtherBob);

    // Try to reset the first user's email.
    const oobs = await inspectOobs(authApi());
    expect(oobs).to.have.length(1);
    expect(oobs[0].requestType).to.equal("RECOVER_EMAIL");

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .send({ oobCode: oobs[0].oobCode })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("EMAIL_EXISTS");
      });
  });

  it("should not set initial email or send OOB when anon user updates email", async () => {
    const { idToken } = await registerAnonUser(authApi());
    const email = "alice@example.com";

    // Update the email once.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, email })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(email);
      });

    // No OOB code should be sent.
    expect(await inspectOobs(authApi())).to.have.length(0);
    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.initialEmail).to.be.undefined;
  });

  it("should not update email if user is disabled", async () => {
    const user = { email: "bob@example.com", password: "notasecret" };
    const newEmail = "alice@example.com";
    const { localId, idToken } = await registerUser(authApi(), user);
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    // Try to update the email.
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, email: newEmail })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
      });
  });

  it("should update phoneNumber if specified", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    const { localId, idToken } = await signInWithPhoneNumber(authApi(), phoneNumber);

    const newPhoneNumber = "+15555550123";
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, phoneNumber: newPhoneNumber })
      .then((res) => expectStatusCode(200, res));

    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.phoneNumber).to.equal(newPhoneNumber);
  });

  it("should noop when setting phoneNumber to the same as before", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    const { localId, idToken } = await signInWithPhoneNumber(authApi(), phoneNumber);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, phoneNumber })
      .then((res) => expectStatusCode(200, res));

    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.phoneNumber).to.equal(phoneNumber);
  });

  it("should disallow setting phone to same as an existing user", async () => {
    const phoneNumber = TEST_PHONE_NUMBER;
    await signInWithPhoneNumber(authApi(), phoneNumber);
    const { localId } = await registerAnonUser(authApi());

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, phoneNumber })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PHONE_NUMBER_EXISTS");
      });
  });

  it("should error if phoneNumber is invalid", async () => {
    const { localId } = await registerAnonUser(authApi());

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, phoneNumber: "555-555-0100" /* no country code */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("INVALID_PHONE_NUMBER : Invalid format.");
      });
  });

  it("should allow creating MFA info", async () => {
    const user = { email: "bob@example.com", password: "notasecret" };
    const { localId, idToken } = await registerUser(authApi(), user);
    const mfaEnrollmentId = "enrollmentId1";

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId,
            },
          ],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.mfaInfo).to.have.length(1);
    const updated = info.mfaInfo![0];
    expect(updated.displayName).to.eq(TEST_MFA_INFO.displayName);
    expect(updated.phoneInfo).to.eq(TEST_MFA_INFO.phoneInfo);
    expect(updated.mfaEnrollmentId).to.eq(mfaEnrollmentId);
  });

  it("should allow adding a second MFA factor", async () => {
    const user = { email: "bob@example.com", password: "notasecret", mfaInfo: [TEST_MFA_INFO] };
    const { localId, idToken } = await registerUser(authApi(), user);
    const savedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(savedUserInfo.mfaInfo).to.have.length(1);
    const savedMfaInfo = savedUserInfo.mfaInfo![0];
    const secondMfaFactor = {
      displayName: "Second MFA Factor",
      phoneInfo: TEST_PHONE_NUMBER_2,
      mfaEnrollmentId: "enrollmentId2",
    };

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [savedMfaInfo, secondMfaFactor],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const updatedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(updatedUserInfo.mfaInfo).to.have.length(2);
    for (const updatedMfaFactor of updatedUserInfo.mfaInfo!) {
      if (updatedMfaFactor.mfaEnrollmentId === savedMfaInfo.mfaEnrollmentId) {
        expect(updatedMfaFactor).to.include(savedMfaInfo);
      } else {
        expect(updatedMfaFactor).to.include(secondMfaFactor);
      }
    }
  });

  it("should allow changing the MFA phone number", async () => {
    const user = { email: "bob@example.com", password: "notasecret", mfaInfo: [TEST_MFA_INFO] };
    const { localId, idToken } = await registerUser(authApi(), user);
    const savedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(savedUserInfo.mfaInfo).to.have.length(1);
    const savedMfaInfo = savedUserInfo.mfaInfo![0];
    expect(savedMfaInfo?.mfaEnrollmentId).to.be.a("string").and.not.empty;
    savedMfaInfo.displayName = "New Display Name";
    savedMfaInfo.phoneInfo = "+15555550101";

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [savedMfaInfo],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const updatedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(updatedUserInfo.mfaInfo).to.have.length(1);
    const updatedMfaInfo = updatedUserInfo.mfaInfo![0];
    expect(updatedMfaInfo?.displayName).to.eq("New Display Name");
    expect(updatedMfaInfo?.phoneInfo).to.eq("+15555550101");
    expect(updatedMfaInfo?.mfaEnrollmentId).to.eq(savedMfaInfo.mfaEnrollmentId);
  });

  it("should allow changing the MFA enrollment ID", async () => {
    const user = { email: "bob@example.com", password: "notasecret", mfaInfo: [TEST_MFA_INFO] };
    const { localId, idToken } = await registerUser(authApi(), user);
    const savedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(savedUserInfo.mfaInfo).to.have.length(1);
    const savedMfaInfo = savedUserInfo.mfaInfo![0];
    expect(savedMfaInfo.mfaEnrollmentId).to.be.a("string").and.not.empty;

    const newEnrollmentId = "newEnrollmentId";
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [{ ...savedMfaInfo, mfaEnrollmentId: newEnrollmentId }],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const updatedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(updatedUserInfo.mfaInfo).to.have.length(1);
    const updatedMfaInfo = updatedUserInfo.mfaInfo![0];
    expect(updatedMfaInfo.displayName).to.eq(savedMfaInfo.displayName);
    expect(updatedMfaInfo.phoneInfo).to.eq(savedMfaInfo.phoneInfo);
    expect(updatedMfaInfo.mfaEnrollmentId).not.to.eq(savedMfaInfo.mfaEnrollmentId);
    expect(updatedMfaInfo.mfaEnrollmentId).to.eq(newEnrollmentId);
  });

  it("should overwrite existing MFA info", async () => {
    const user = {
      email: "bob@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO, { ...TEST_MFA_INFO, phoneInfo: TEST_PHONE_NUMBER_3 }],
    };
    const { localId, idToken } = await registerUser(authApi(), user);
    const savedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(savedUserInfo.mfaInfo).to.have.length(2);
    const oldEnrollmentIds = savedUserInfo.mfaInfo!.map((_) => _.mfaEnrollmentId);

    const newMfaInfo = {
      displayName: "New New",
      phoneInfo: TEST_PHONE_NUMBER_3,
      mfaEnrollmentId: "newEnrollmentId",
    };
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [newMfaInfo],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const updatedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(updatedUserInfo.mfaInfo).to.have.length(1);
    const updatedMfaInfo = updatedUserInfo.mfaInfo![0];
    expect(updatedMfaInfo.phoneInfo).to.eq(newMfaInfo.phoneInfo);
    expect(updatedMfaInfo.displayName).to.eq(newMfaInfo.displayName);
    expect(updatedMfaInfo.mfaEnrollmentId).to.eq(newMfaInfo.mfaEnrollmentId);
    expect(oldEnrollmentIds).not.to.include(updatedMfaInfo.mfaEnrollmentId);
  });

  it("should remove MFA info with an empty enrollments array", async () => {
    const user = {
      email: "bob@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
    };
    const { localId, idToken } = await registerUser(authApi(), user);
    const savedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(savedUserInfo.mfaInfo).to.have.length(1);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const updatedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(updatedUserInfo.mfaInfo).to.be.undefined;
  });

  it("should remove MFA info with an undefined enrollments array", async () => {
    const user = {
      email: "bob@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
    };
    const { localId, idToken } = await registerUser(authApi(), user);
    const savedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(savedUserInfo.mfaInfo).to.have.length(1);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: undefined,
        },
      })
      .then((res) => expectStatusCode(200, res));

    const updatedUserInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(updatedUserInfo.mfaInfo).to.be.undefined;
  });

  it("should error if mfaEnrollmentId is absent", async () => {
    const user = { email: "bob@example.com", password: "notasecret", mfaInfo: [TEST_MFA_INFO] };
    const { localId } = await registerUser(authApi(), user);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [TEST_MFA_INFO],
        },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.eq(
          "INVALID_MFA_ENROLLMENT_ID : mfaEnrollmentId must be defined."
        );
      });
  });

  it("should de-duplicate MFA factors with the same phone number", async () => {
    const user = { email: "bob@example.com", password: "notasecret" };
    const { localId, idToken } = await registerUser(authApi(), user);
    const mfaEnrollmentId = "enrollmentId1";

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId,
            },
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId,
            },
          ],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.mfaInfo).to.have.length(1);
    const updated = info.mfaInfo![0];
    expect(updated).to.include(TEST_MFA_INFO);
    expect(updated.mfaEnrollmentId).to.eq(mfaEnrollmentId);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const updatedInfo = await getAccountInfoByIdToken(authApi(), idToken);
    expect(updatedInfo.mfaInfo).to.be.undefined;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId: "enrollmentId2",
            },
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId: "enrollmentId3",
            },
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId: "enrollmentId4",
            },
          ],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const thirdUpdate = await getAccountInfoByIdToken(authApi(), idToken);
    expect(thirdUpdate.mfaInfo).to.have.length(1);
    const thirdMfaInfo = thirdUpdate.mfaInfo![0];
    expect(thirdMfaInfo).to.include(TEST_MFA_INFO);
    expect(thirdMfaInfo.mfaEnrollmentId).not.to.eq(mfaEnrollmentId);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId: "enrollmentId5",
            },
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId: "enrollmentId6",
            },
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId: "enrollmentId7",
            },
            {
              phoneInfo: TEST_PHONE_NUMBER_2,
              mfaEnrollmentId: "enrollmentId8",
            },
            {
              phoneInfo: TEST_PHONE_NUMBER_2,
              mfaEnrollmentId: "enrollmentId9",
            },
          ],
        },
      })
      .then((res) => expectStatusCode(200, res));

    const fourthUpdate = await getAccountInfoByIdToken(authApi(), idToken);
    expect(fourthUpdate.mfaInfo).to.have.length(2);
    for (const mfaInfo of fourthUpdate.mfaInfo!) {
      if (mfaInfo.phoneInfo === TEST_MFA_INFO.phoneInfo) {
        expect(mfaInfo).to.include(TEST_MFA_INFO);
      } else {
        expect(mfaInfo.phoneInfo).to.eq(TEST_PHONE_NUMBER_2);
      }
      expect(mfaInfo.mfaEnrollmentId).to.be.a("string").and.not.empty;
      expect(mfaInfo.mfaEnrollmentId).not.to.eq(mfaEnrollmentId);
    }
  });

  it("should error if MFA Enrollment ID is duplicated for different phone numbers", async () => {
    const { localId } = await registerUser(authApi(), {
      email: "bob@example.com",
      password: "notasecret",
    });

    const mfaEnrollmentId = "duplicateMfaEnrollmentId ";
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId,
            },
            {
              phoneInfo: TEST_PHONE_NUMBER_2,
              mfaEnrollmentId,
            },
          ],
        },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.eq("DUPLICATE_MFA_ENROLLMENT_ID");
      });
  });

  it("does not require MFA Enrollment ID uniqueness across users", async () => {
    const bobUser = { email: "bob@example.com", password: "notasecret", mfaInfo: [TEST_MFA_INFO] };
    const aliceUser = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
    };
    const { localId: bobLocalId, idToken: bobIdToken } = await registerUser(authApi(), bobUser);
    const bobInfo = await getAccountInfoByIdToken(authApi(), bobIdToken);
    expect(bobInfo.mfaInfo).to.have.length(1);

    const { idToken: aliceIdToken } = await registerUser(authApi(), aliceUser);
    const aliceInfo = await getAccountInfoByIdToken(authApi(), aliceIdToken);
    expect(aliceInfo.mfaInfo).to.have.length(1);
    const aliceEnrollmentId = aliceInfo.mfaInfo![0].mfaEnrollmentId;

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId: bobLocalId,
        mfa: {
          enrollments: [
            {
              ...bobInfo.mfaInfo![0],
              mfaEnrollmentId: aliceEnrollmentId,
            },
          ],
        },
      })
      .then((res) => {
        expectStatusCode(200, res);
      });

    const updatedBobInfo = await getAccountInfoByIdToken(authApi(), bobIdToken);
    expect(updatedBobInfo.mfaInfo![0].mfaEnrollmentId).to.equal(aliceEnrollmentId);
  });

  it("should error if phone number for MFA is invalid", async () => {
    const user = { email: "bob@example.com", password: "notasecret", mfaInfo: [TEST_MFA_INFO] };
    const { localId, idToken } = await registerUser(authApi(), user);
    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.mfaInfo).to.have.length(1);
    const mfaInfoForUpdate = { ...info.mfaInfo![0] };

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [
            {
              ...mfaInfoForUpdate,
              phoneInfo: undefined,
            },
          ],
        },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.eq("INVALID_MFA_PHONE_NUMBER : Invalid format.");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId,
        mfa: {
          enrollments: [
            {
              ...mfaInfoForUpdate,
              phoneInfo: TEST_INVALID_PHONE_NUMBER,
            },
          ],
        },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.eq("INVALID_MFA_PHONE_NUMBER : Invalid format.");
      });
  });

  it("should error if user for MFA update is not found", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId: "anything",
        mfa: {
          enrollments: [
            {
              ...TEST_MFA_INFO,
              mfaEnrollmentId: "anything",
            },
          ],
        },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.eq("USER_NOT_FOUND");
      });
  });

  it("should error if enrollments is not an array or undefined", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({
        localId: "anything",
        mfa: {
          enrollments: null,
        },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.eq(
          "Invalid JSON payload received. /mfa/enrollments should be array"
        );
      });
  });

  it("should error if user is disabled when updating by idToken", async () => {
    const { localId, idToken } = await registerAnonUser(authApi());
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, displayName: "Foo" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("USER_DISABLED");
      });
  });

  it("should still update user despite user is disabled when authenticated", async () => {
    const { localId } = await registerAnonUser(authApi());
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    // These should still work.
    await updateAccountByLocalId(authApi(), localId, { displayName: "Foo" });
    await updateAccountByLocalId(authApi(), localId, { disableUser: false });
  });

  it("should invalidate old tokens after updating validSince or password", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { idToken } = await registerUser(authApi(), user);

    // Move time forward so idToken's iat (issuedAt) is in the past.
    getClock().tick(2000);

    const idToken2 = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, password: "notasecreteither" })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.idToken as string;
      });

    // Old idToken should no longer work, while the new one works.
    await expectIdTokenExpired(authApi(), idToken);
    await getAccountInfoByIdToken(authApi(), idToken2);

    // Move time forward so idToken2's iat (issuedAt) is in the past.
    getClock().tick(2000);

    const idToken3 = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({
        idToken: idToken2,
        validSince: "0" /* any value works, only the presence of the field matters */,
      })
      .then((res) => {
        expectStatusCode(200, res);
        return res.body.idToken as string;
      });

    await expectIdTokenExpired(authApi(), idToken);
    await expectIdTokenExpired(authApi(), idToken2);
    await getAccountInfoByIdToken(authApi(), idToken3);
  }).timeout(5000);

  function itShouldDeleteProvider(
    createUser: () => Promise<{ idToken: string; email?: string }>,
    providerId: string
  ): void {
    it(`should delete ${providerId} provider from user`, async () => {
      const user = await createUser();
      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:update")
        .query({ key: "fake-api-key" })
        .send({ idToken: user.idToken, deleteProvider: [providerId] })
        .then((res) => {
          expectStatusCode(200, res);
          const providers = (res.body.providerUserInfo || []).map(
            (info: ProviderUserInfo) => info.providerId
          );
          expect(providers).not.to.include(providerId);
        });

      if (user.email) {
        expect(await getSigninMethods(authApi(), user.email)).not.to.contain(providerId);
        expect(await getSigninMethods(authApi(), user.email)).not.to.contain("emailLink");
      }
    });
  }

  itShouldDeleteProvider(
    () => registerUser(authApi(), { email: "alice@example.com", password: "notasecret" }),
    PROVIDER_PASSWORD
  );
  itShouldDeleteProvider(() => signInWithPhoneNumber(authApi(), TEST_PHONE_NUMBER), PROVIDER_PHONE);
  itShouldDeleteProvider(
    () =>
      signInWithFakeClaims(authApi(), "google.com", {
        sub: "12345",
        email: "bob@example.com",
      }),
    "google.com"
  );

  it("should update user by localId when authenticated", async () => {
    const { localId } = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "barbaz",
    });

    const attrs = {
      phoneNumber: TEST_PHONE_NUMBER,
      displayName: "Alice",
      photoUrl: "http://localhost/alice.png",
    };
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, ...attrs, emailVerified: true })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.displayName).to.equal(attrs.displayName);
        expect(res.body.photoUrl).to.equal(attrs.photoUrl);
        expect(res.body.emailVerified).to.be.true;
      });
  });

  it("should error if authenticated request does not specify localId", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ emailVerified: true /* no localId */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_LOCAL_ID");
      });
  });

  it("should update customAttributes and add them to ID Tokens", async () => {
    const { localId, email } = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "barbaz",
    });

    const attrs = {
      foo: "bar",
      baz: { answer: 42 },
    };
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, customAttributes: JSON.stringify(attrs) })
      .then((res) => expectStatusCode(200, res));

    const { idToken } = await signInWithEmailLink(authApi(), email);
    const decoded = decodeJwt(idToken, { complete: true }) as {
      header: JwtHeader;
      payload: FirebaseJwtPayload;
    } | null;
    expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
    expect(decoded!.payload).to.have.property("foo").to.eql(attrs.foo);
    expect(decoded!.payload).to.have.property("baz").to.eql(attrs.baz);
  });

  it("should error if customAttributes are invalid", async () => {
    const { localId } = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "barbaz",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, customAttributes: "{definitely[not]json}" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_CLAIMS");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, customAttributes: "42" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_CLAIMS");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, customAttributes: '["a", "b"]' })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_CLAIMS");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      // Contains a forbidden field "sub".
      .send({ localId, customAttributes: '{"sub": "12345"}' })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("FORBIDDEN_CLAIM : sub");
      });

    const longString = new Array(999).join("x");
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .set("Authorization", "Bearer owner")
      .send({ localId, customAttributes: `{"a":"${longString}"}` })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("CLAIMS_TOO_LARGE");
      });
  });

  it("should error if usageMode is passthrough", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { idToken } = await registerUser(authApi(), user);
    const newPassword = "notasecreteither";
    await deleteAccount(authApi(), { idToken });
    await updateProjectConfig(authApi(), { usageMode: "PASSTHROUGH" });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, password: newPassword })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("UNSUPPORTED_PASSTHROUGH_OPERATION");
      });
  });
});
