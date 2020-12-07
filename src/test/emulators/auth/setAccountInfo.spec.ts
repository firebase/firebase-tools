import { expect } from "chai";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { ProviderUserInfo, PROVIDER_PASSWORD, PROVIDER_PHONE } from "../../../emulator/auth/state";
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
  signInWithEmailLink,
  expectIdTokenExpired,
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
        expect(decoded!.payload.user_id).to.equal(localId);
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("password");
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
        expect(decoded!.payload.user_id).to.equal(localId);
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("password");
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
        expect(decoded!.payload.user_id).to.equal(localId);
        // This remains the same as provider used by the previous idToken.
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("anonymous");
      });

    expect(await getSigninMethods(authApi(), email)).not.to.contain(["password"]);
  });

  it("should allow changing email of an existing user", async () => {
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
        expect(decoded!.payload.user_id).to.equal(localId);
        expect(decoded!.payload.email).to.equal(newEmail);
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals("password");
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
        expect(res.body.error)
          .to.have.property("message")
          .equals("EMAIL_EXISTS");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      // Case variants of a same email address are also considered duplicates.
      .send({ idToken, email: "BOB@example.com", password: "notasecret" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("EMAIL_EXISTS");
      });
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
        expect(res.body.error)
          .to.have.property("message")
          .equals("PHONE_NUMBER_EXISTS");
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

  it("should error if user is disabled when updating by idToken", async () => {
    const { localId, idToken } = await registerAnonUser(authApi());
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({ idToken, displayName: "Foo" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("USER_DISABLED");
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
    expect(decoded!.payload)
      .to.have.property("foo")
      .to.eql(attrs.foo);
    expect(decoded!.payload)
      .to.have.property("baz")
      .to.eql(attrs.baz);
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
});
