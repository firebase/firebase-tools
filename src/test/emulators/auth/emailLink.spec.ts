import { expect } from "chai";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { describeAuthEmulator } from "./setup";
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
  deleteAccount,
  updateProjectConfig,
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

  it("should error on signInWithEmailLink if usageMode is passthrough", async () => {
    const user = { email: "bob@example.com", password: "notasecret" };
    const { oobCode } = await createEmailSignInOob(authApi(), user.email);
    await updateProjectConfig(authApi(), { usageMode: "PASSTHROUGH" });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, oobCode })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("UNSUPPORTED_PASSTHROUGH_OPERATION");
      });
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
          "INVALID_EMAIL : The email provided does not match the sign-in email address."
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

  it("should error if user has MFA", async () => {
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
        expectStatusCode(501, res);
        expect(res.body.error.message).to.equal("MFA Login not yet implemented.");
      });
  });
});
