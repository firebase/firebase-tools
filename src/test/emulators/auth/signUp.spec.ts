import { expect } from "chai";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { TEST_PHONE_NUMBER } from "./helpers";
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
} from "./helpers";

describeAuthEmulator("accounts:signUp", ({ authApi }) => {
  it("should throw error if no email provided", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ password: "notasecret" /* no email */ })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("MISSING_EMAIL");
      });
  });

  it("should issue idToken and refreshToken on anon signUp", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ returnSecureToken: true })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body)
          .to.have.property("refreshToken")
          .that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.be.a("string");
        expect(decoded!.payload.provider_id).equals("anonymous");
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("anonymous");
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
        expect(res.body)
          .to.have.property("refreshToken")
          .that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.be.a("string");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("password");
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
        expect(res.body.error)
          .to.have.property("message")
          .equals("EMAIL_EXISTS");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      // Case variants of a same email address are also considered duplicates.
      .send({ email: "BOB@example.com", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("EMAIL_EXISTS");
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
        expect(res.body.error)
          .to.have.property("message")
          .equals("EMAIL_EXISTS");
      });
  });

  it("should error when email format is invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ email: "not.an.email.address.at.all", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("INVALID_EMAIL");
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
        expect(res.body.error)
          .to.have.property("message")
          .equals("MISSING_EMAIL");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signUp")
      .send({ idToken, email: "alice@example.com" /* no password */ })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("MISSING_PASSWORD");
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
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("password");
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
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("password");

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
      .send({ phoneNumber: "5555550100" /* no country code */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_PHONE_NUMBER : Invalid format.");
      });
  });
});
