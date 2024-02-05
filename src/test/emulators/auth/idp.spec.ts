import { expect } from "chai";
import * as nock from "nock";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { PROVIDER_PASSWORD, SIGNIN_METHOD_EMAIL_LINK } from "../../../emulator/auth/state";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
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
  updateProjectConfig,
  fakeClaims,
  TEST_PHONE_NUMBER,
  FAKE_GOOGLE_ACCOUNT,
  REAL_GOOGLE_ACCOUNT,
  enrollPhoneMfa,
  getAccountInfoByLocalId,
  registerTenant,
  updateConfig,
  BEFORE_CREATE_PATH,
  BEFORE_CREATE_URL,
  BEFORE_SIGN_IN_PATH,
  BEFORE_SIGN_IN_URL,
  BLOCKING_FUNCTION_HOST,
  DISPLAY_NAME,
  PHOTO_URL,
} from "./helpers";

// Many JWT fields from IDPs use snake_case and we need to match that.

describeAuthEmulator("sign-in with credential", ({ authApi, getClock }) => {
  it("should create new account with IDP from unsigned ID token", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=google.com&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.isNewUser).to.equal(true);
        expect(res.body.email).to.equal(FAKE_GOOGLE_ACCOUNT.email);
        expect(res.body.emailVerified).to.equal(FAKE_GOOGLE_ACCOUNT.emailVerified);
        expect(res.body.federatedId).to.equal(
          `https://accounts.google.com/${FAKE_GOOGLE_ACCOUNT.rawId}`,
        );
        expect(res.body.oauthIdToken).to.equal(FAKE_GOOGLE_ACCOUNT.idToken);
        expect(res.body.providerId).to.equal("google.com");
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        // The ID Token used above does NOT contain name or photo, so the
        // account created won't have those attributes either.
        expect(res.body).not.to.have.property("displayName");
        expect(res.body).not.to.have.property("photoUrl");

        const raw = JSON.parse(res.body.rawUserInfo);
        expect(raw.id).to.equal(FAKE_GOOGLE_ACCOUNT.rawId);
        expect(raw.email).to.equal(FAKE_GOOGLE_ACCOUNT.email);
        expect(raw.verified_email).to.equal(true);
        expect(raw.locale).to.equal("en");
        // name, given_name, family_name, and picture are not populated since
        // they are not in the ID Token used above.
        expect(raw.granted_scopes.split(" ")).to.have.members([
          "openid",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/userinfo.email",
        ]);

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("identities")
          .eql({
            "google.com": [FAKE_GOOGLE_ACCOUNT.rawId],
            email: [FAKE_GOOGLE_ACCOUNT.email],
          });
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("google.com");
      });
  });

  it("should create new account with IDP from production ID token", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=google.com&id_token=${REAL_GOOGLE_ACCOUNT.idToken}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.isNewUser).to.equal(true);
        expect(res.body.email).to.equal(REAL_GOOGLE_ACCOUNT.email);
        expect(res.body.emailVerified).to.equal(REAL_GOOGLE_ACCOUNT.emailVerified);
        expect(res.body.federatedId).to.equal(
          `https://accounts.google.com/${REAL_GOOGLE_ACCOUNT.rawId}`,
        );
        expect(res.body.oauthIdToken).to.equal(REAL_GOOGLE_ACCOUNT.idToken);
        expect(res.body.providerId).to.equal("google.com");
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        // The ID Token used above does NOT contain name or photo, so the
        // account created won't have those attributes either.
        expect(res.body).not.to.have.property("displayName");
        expect(res.body).not.to.have.property("photoUrl");

        const raw = JSON.parse(res.body.rawUserInfo);
        expect(raw.id).to.equal(REAL_GOOGLE_ACCOUNT.rawId);
        expect(raw.email).to.equal(REAL_GOOGLE_ACCOUNT.email);
        expect(raw.verified_email).to.equal(true);
        expect(raw.locale).to.equal("en");
        // name, given_name, family_name, and picture are not populated since
        // they are not in the ID Token used above.
        expect(raw.granted_scopes.split(" ")).to.have.members([
          "openid",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/userinfo.email",
        ]);

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("identities")
          .eql({
            "google.com": [REAL_GOOGLE_ACCOUNT.rawId],
            email: [REAL_GOOGLE_ACCOUNT.email],
          });
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("google.com");
      });
  });

  it("should create new account with IDP from unencoded JSON claims", async () => {
    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Ada Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
      picture: "http://localhost/fake-picture-url.png",
    });
    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.isNewUser).to.equal(true);
        expect(res.body.federatedId).to.equal(`https://accounts.google.com/${claims.sub}`);
        expect(res.body.oauthIdToken).to.equal(fakeIdToken);
        expect(res.body.providerId).to.equal("google.com");
        expect(res.body.displayName).to.equal(claims.name);
        expect(res.body.fullName).to.equal(claims.name);
        expect(res.body.firstName).to.equal(claims.given_name);
        expect(res.body.lastName).to.equal(claims.family_name);
        expect(res.body.photoUrl).to.equal(claims.picture);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const raw = JSON.parse(res.body.rawUserInfo);
        expect(raw.id).to.equal(claims.sub);
        expect(raw.name).to.equal(claims.name);
        expect(raw.given_name).to.equal(claims.given_name);
        expect(raw.family_name).to.equal(claims.family_name);
        expect(raw.picture).to.equal(claims.picture);
        expect(raw.granted_scopes.split(" ")).not.to.contain(
          "https://www.googleapis.com/auth/userinfo.email",
        );

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("identities")
          .eql({
            "google.com": [claims.sub],
          });
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("google.com");
      });
  });

  it("should accept params (e.g. providerId, id_token) in requestUri", async () => {
    const claims = fakeClaims({
      sub: "123456789012345678901",
    });
    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        // No postBody, all params in requestUri below.
        requestUri: `http://localhost?providerId=google.com&id_token=${encodeURIComponent(
          fakeIdToken,
        )}`,
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.providerId).to.equal("google.com");
      });
  });

  it("should copy attributes to user on IDP sign-up", async () => {
    const claims = fakeClaims({
      sub: "123456789012345678901",
      screen_name: "turingcomplete",
      name: "Alan Turing",
      picture: "http://localhost/turing.png",
    });
    const { idToken } = await signInWithFakeClaims(authApi(), "google.com", claims);

    const user = await getAccountInfoByIdToken(authApi(), idToken);
    expect(user.photoUrl).equal(claims.picture);
    expect(user.displayName).equal(claims.name);
    expect(user.screenName).equal(claims.screen_name);
  });

  it("should allow duplicate emails if set in project config", async () => {
    await updateProjectConfig(authApi(), { signIn: { allowDuplicateEmails: true } });

    const email = "alice@example.com";

    // Given there exists an account with email already:
    const user1 = await registerUser(authApi(), { email, password: "notasecret" });

    // When trying to sign-in with IDP that claims the same email:
    const user2 = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "123456789012345678901",
      email,
    });

    // It should create a new account with different local ID:
    expect(user2.localId).not.to.equal(user1.localId);
  });

  it("should sign-up new users without copying email when allowing duplicate emails", async () => {
    await updateProjectConfig(authApi(), { signIn: { allowDuplicateEmails: true } });

    const email = "alice@example.com";

    const user1 = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "123456789012345678901",
      email,
    });

    const info = await getAccountInfoByIdToken(authApi(), user1.idToken);
    expect(info.email).to.be.undefined;
  });

  it("should allow multiple providers with same email when allowing duplicate emails", async () => {
    await updateProjectConfig(authApi(), { signIn: { allowDuplicateEmails: true } });

    const email = "alice@example.com";

    const user1 = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "123456789012345678901",
      email,
    });
    const user2 = await signInWithFakeClaims(authApi(), "facebook.com", {
      sub: "123456789012345678901",
      email,
    });

    expect(user2.localId).not.to.equal(user1.localId);
  });

  it("should sign in existing account if (providerId, sub) is the same", async () => {
    const user1 = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "123456789012345678901",
    });

    // Same sub, same user.
    const user2 = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "123456789012345678901",
    });
    expect(user2.localId).to.equal(user1.localId);

    // Different sub, different user.
    const user3 = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "000000000000000000000",
    });
    expect(user3.localId).not.to.equal(user1.localId);

    // Different providerId, different user.
    const user4 = await signInWithFakeClaims(authApi(), "apple.com", {
      sub: "123456789012345678901",
    });
    expect(user4.localId).not.to.equal(user1.localId);
  });

  it("should error if user is disabled", async () => {
    const user = await signInWithFakeClaims(authApi(), "google.com", {
      sub: "123456789012345678901",
    });
    await updateAccountByLocalId(authApi(), user.localId, { disableUser: true });

    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Foo",
    });
    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken: user.idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("USER_DISABLED");
      });
  });

  it("should add IDP as a sign-in method for email if available", async () => {
    const email = "foo@example.com";
    const sub = "123456789012345678901";
    await signInWithFakeClaims(authApi(), "google.com", {
      sub,
      email,
    });
    expect(await getSigninMethods(authApi(), email)).to.eql(["google.com"]);

    const newEmail = "bar@example.com";
    const { idToken } = await signInWithFakeClaims(authApi(), "google.com", {
      sub,
      email: newEmail,
    });

    expect(await getSigninMethods(authApi(), newEmail)).to.eql(["google.com"]);

    // The account-level email is still the old email.
    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.email).to.equal(email);
  });

  it("should unlink password and overwite profile attributes if user had unverified email", async () => {
    // Given a user with unverified email, linked with password:
    const { localId, email } = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "notasecret",
      displayName: "Foo",
    });

    // When signing in with IDP and IDP verifies email:
    const providerId = "google.com";
    const photoUrl = "http://localhost/photo-from-idp.png";
    const idpSignIn = await signInWithFakeClaims(authApi(), providerId, {
      sub: "123456789012345678901",
      email,
      email_verified: true,
      picture: photoUrl,
    });

    // It should sign-in into the same account, but the account's password
    // should be unlinked.
    expect(idpSignIn.localId).to.equal(localId);
    const signInMethods = await getSigninMethods(authApi(), email);
    expect(signInMethods).to.eql([providerId]);
    expect(signInMethods).not.to.contain([PROVIDER_PASSWORD]);

    const info = await getAccountInfoByIdToken(authApi(), idpSignIn.idToken);
    expect(info.emailVerified).to.be.true; // Verified by IDP.

    // Profile attributes should be overwritten (if provided by IDP) or cleared.
    expect(info.photoUrl).to.equal(photoUrl);
    expect(info.displayName).to.be.undefined; // Not provided by IDP.
  });

  it("should not unlink password if email was already verified", async () => {
    // Given a user with verified email, linked with password:
    const user = {
      email: "foo@example.com",
      password: "notasecret",
      displayName: "Foo",
    };
    const { localId, email } = await registerUser(authApi(), user);
    await signInWithEmailLink(authApi(), email); // Verify email via email link sign-in.

    // When signing in with IDP and IDP verifies email:
    const providerId = "google.com";
    const photoUrl = "http://localhost/photo-from-idp.png";
    const idpSignIn = await signInWithFakeClaims(authApi(), providerId, {
      sub: "123456789012345678901",
      email,
      email_verified: true,
      picture: photoUrl,
    });

    // It should sign-in into the same account and keep all providers and info.
    expect(idpSignIn.localId).to.equal(localId);
    const signInMethods = await getSigninMethods(authApi(), email);
    expect(signInMethods).to.have.members([
      providerId,
      PROVIDER_PASSWORD,
      SIGNIN_METHOD_EMAIL_LINK,
    ]);

    const info = await getAccountInfoByIdToken(authApi(), idpSignIn.idToken);
    expect(info.emailVerified).to.be.true; // Verified by IDP.

    // Profile attributes should be overwritten (if provided by IDP) or cleared.
    expect(info.photoUrl).to.equal(photoUrl);
    expect(info.displayName).to.be.undefined; // Not provided by IDP.
  });

  it("should return needConfirmation if both account and IDP has unverified email", async () => {
    // Given a user with unverified email:
    const email = "bar@example.com";
    const providerId1 = "facebook.com";
    const originalDisplayName = "Bar";
    const { localId, idToken } = await signInWithFakeClaims(authApi(), providerId1, {
      sub: "123456789012345678901",
      email,
      email_verified: false,
      name: originalDisplayName,
    });

    // When signing in with IDP and IDP does not verify email:
    const providerId2 = "google.com";
    const fakeIdToken = JSON.stringify(
      fakeClaims({
        sub: "123456789012345678901",
        email,
        email_verified: false,
        name: "Foo",
        picture: "http://localhost/photo-from-idp.png",
      }),
    );

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        requestUri: `http://localhost?providerId=${providerId2}&id_token=${encodeURIComponent(
          fakeIdToken,
        )}`,
        returnIdpCredential: true,
      })
      .then((res) => {
        // It should fail to sign in with needConfirmation.
        expectStatusCode(200, res);
        expect(res.body.needConfirmation).to.equal(true);
        expect(res.body.localId).to.equal(localId);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body.verifiedProvider).to.eql([providerId1]);
      });

    const signInMethods = await getSigninMethods(authApi(), email);
    expect(signInMethods).to.have.members([providerId1]);
    expect(signInMethods).not.to.include([providerId2]);

    // Account should not be updated.
    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.emailVerified).to.be.false;
    expect(info.displayName).to.equal(originalDisplayName);
    expect(info.photoUrl).to.be.undefined;
  });

  it("should error when requestUri is missing or invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_REQUEST_URI");
      });
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
        requestUri: "notAnAbsoluteUriAndThusInvalid",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("INVALID_REQUEST_URI");
      });
  });

  it("should error when missing providerId is missing", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
        requestUri: "http://localhost",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.contain(
          "INVALID_CREDENTIAL_OR_PROVIDER_ID : Invalid IdP response/credential:",
        );
      });
  });

  it("should error when sub is missing or not a string", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        // No sub in token.
        postBody: `providerId=google.com&id_token=${JSON.stringify({})}`,
        requestUri: "http://localhost",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.contain("INVALID_IDP_RESPONSE");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        // sub is not a string
        postBody: `providerId=google.com&id_token=${JSON.stringify({ sub: 12345 })}`,
        requestUri: "http://localhost",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.contain("INVALID_IDP_RESPONSE");
      });
  });

  it("should link IDP to existing account by idToken", async () => {
    const user = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "notasecret",
    });
    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Foo",
    });
    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken: user.idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(!!res.body.isNewUser).to.equal(false);
        expect(res.body.localId).to.equal(user.localId);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("identities")
          .eql({
            "google.com": [claims.sub],
            email: [user.email],
          });
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("google.com");
      });

    const signInMethods = await getSigninMethods(authApi(), user.email);
    expect(signInMethods).to.have.members(["google.com", PROVIDER_PASSWORD]);
  });

  it("should copy IDP email to user-level email if not present", async () => {
    const user = await signInWithPhoneNumber(authApi(), TEST_PHONE_NUMBER);
    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Foo",
      email: "example@google.com",
    });
    const fakeIdToken = JSON.stringify(claims);
    const idToken = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken: user.idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(!!res.body.isNewUser).to.equal(false);
        expect(res.body.localId).to.equal(user.localId);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("identities")
          .eql({
            "google.com": [claims.sub],
            email: [claims.email],
            phone: [TEST_PHONE_NUMBER],
          });
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("google.com");

        return res.body.idToken as string;
      });

    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.email).to.be.equal(claims.email);
    expect(!!info.emailVerified).to.be.equal(!!claims.email_verified);
  });

  it("should error if user to be linked is disabled", async () => {
    const user = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "notasecret",
    });
    await updateAccountByLocalId(authApi(), user.localId, { disableUser: true });

    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Foo",
    });
    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken: user.idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("USER_DISABLED");
      });
  });

  it("should return pending credential for MFA-enabled user", async () => {
    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Foo",
      email: "foo@example.com",
      email_verified: true,
    });
    const { idToken, localId } = await signInWithFakeClaims(authApi(), "google.com", claims);
    await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER);
    const beforeSignIn = await getAccountInfoByLocalId(authApi(), localId);

    getClock().tick(3333);

    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        const mfaPendingCredential = res.body.mfaPendingCredential as string;
        expect(mfaPendingCredential).to.be.a("string");
        expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
      });

    // Login / refresh timestamps should not change until MFA was successful.
    const afterFirstFactor = await getAccountInfoByLocalId(authApi(), localId);
    expect(afterFirstFactor.lastLoginAt).to.equal(beforeSignIn.lastLoginAt);
    expect(afterFirstFactor.lastRefreshAt).to.equal(beforeSignIn.lastRefreshAt);
  });

  it("should link IDP for existing MFA-enabled user", async () => {
    const email = "alice@example.com";
    const { idToken, localId } = await signInWithEmailLink(authApi(), email);
    await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER);

    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Foo",
      email,
      email_verified: true,
    });

    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        const mfaPendingCredential = res.body.mfaPendingCredential as string;
        expect(mfaPendingCredential).to.be.a("string");
        expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
      });

    // IDP sign-in should be linked even before second factor is verified.
    expect(await getSigninMethods(authApi(), email)).to.have.members(["google.com", "emailLink"]);

    // Similarly, user information from IDP should be added to account.
    const info = await getAccountInfoByLocalId(authApi(), localId);
    expect(info.displayName).to.equal(claims.name);
  });

  it("should return error if IDP account is already linked to the same user", async () => {
    // Given a user with already linked with IDP account:
    const providerId = "google.com";
    const claims = {
      sub: "123456789012345678901",
      email: "alice@example.com",
      email_verified: false,
    };
    const { idToken } = await signInWithFakeClaims(authApi(), providerId, claims);

    // When trying to link the same IDP account on the same user:
    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.be.undefined;
        expect(res.body).not.to.have.property("refreshToken");

        expect(res.body.errorMessage).to.equal("FEDERATED_USER_ID_ALREADY_LINKED");
        expect(res.body.oauthIdToken).to.equal(fakeIdToken);
      });
  });

  it("should return error if IDP account is already linked to another user", async () => {
    // Given a user with already linked with IDP account:
    const providerId = "google.com";
    const claims = {
      sub: "123456789012345678901",
      email: "alice@example.com",
      email_verified: false,
    };
    await signInWithFakeClaims(authApi(), providerId, claims);

    const user = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "notasecret",
    });
    // When trying to link the same IDP account on a different user:
    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken: user.idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("FEDERATED_USER_ID_ALREADY_LINKED");
      });

    // Sign-in methods for either user should not be changed since linking failed.
    const signInMethods1 = await getSigninMethods(authApi(), user.email);
    expect(signInMethods1).to.have.members([PROVIDER_PASSWORD]);
    const signInMethods2 = await getSigninMethods(authApi(), claims.email);
    expect(signInMethods2).to.have.members([providerId]);
  });

  it("should return error if IDP account email already exists if NOT allowDuplicateEmail", async () => {
    // Given an existing account with the email:
    const email = "alice@example.com";
    await registerUser(authApi(), { email, password: "notasecret" });

    // When trying to link an IDP account on a different user with the same email:
    const { idToken } = await registerAnonUser(authApi());
    const fakeIdToken = JSON.stringify(
      fakeClaims({
        sub: "12345",
        email,
      }),
    );
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("EMAIL_EXISTS");
      });
  });

  it("should allow linking IDP account with same email to same user", async () => {
    // Given an existing account with the email:
    const email = "alice@example.com";
    const { idToken, localId } = await registerUser(authApi(), { email, password: "notasecret" });

    // When trying to link an IDP account on user with the same email:
    const fakeIdToken = JSON.stringify(
      fakeClaims({
        sub: "12345",
        email,
        email_verified: true,
      }),
    );
    const newIdToken = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);

        return res.body.idToken as string;
      });

    // Account email is now verified.
    const info = await getAccountInfoByIdToken(authApi(), newIdToken);
    expect(info.emailVerified).to.be.true;
  });

  it("should allow linking IDP account with same email if allowDuplicateEmail", async () => {
    // Given an existing account with the email:
    const email = "alice@example.com";
    await registerUser(authApi(), { email, password: "notasecret" });

    await updateProjectConfig(authApi(), { signIn: { allowDuplicateEmails: true } });

    // When trying to link an IDP account on a different user with the same email:
    const { idToken, localId } = await registerAnonUser(authApi());
    const fakeIdToken = JSON.stringify(
      fakeClaims({
        sub: "12345",
        email,
      }),
    );
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).to.equal(localId);
      });
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({ tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("PROJECT_DISABLED");
      });
  });

  it("should create a new account with tenantId", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: false });

    const localId = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=google.com&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
        tenantId: tenant.tenantId,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.tenantId).to.eql(tenant.tenantId);
        return res.body.localId;
      });

    const user = await getAccountInfoByLocalId(authApi(), localId, tenant.tenantId);
    expect(user.tenantId).to.eql(tenant.tenantId);
  });

  it("should return pending credential for MFA-enabled user and enabled on tenant project", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, {
      disableAuth: false,
      mfaConfig: {
        state: "ENABLED",
        enabledProviders: ["PHONE_SMS"],
      },
    });
    const claims = fakeClaims({
      sub: "123456789012345678901",
      name: "Foo",
      email: "foo@example.com",
      email_verified: true,
    });
    const { idToken, localId } = await signInWithFakeClaims(
      authApi(),
      "google.com",
      claims,
      tenant.tenantId,
    );
    await enrollPhoneMfa(authApi(), idToken, TEST_PHONE_NUMBER, tenant.tenantId);
    const beforeSignIn = await getAccountInfoByLocalId(authApi(), localId, tenant.tenantId);

    getClock().tick(3333);

    const fakeIdToken = JSON.stringify(claims);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        tenantId: tenant.tenantId,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        const mfaPendingCredential = res.body.mfaPendingCredential as string;
        expect(mfaPendingCredential).to.be.a("string");
        expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
      });

    // Login / refresh timestamps should not change until MFA was successful.
    const afterFirstFactor = await getAccountInfoByLocalId(authApi(), localId, tenant.tenantId);
    expect(afterFirstFactor.lastLoginAt).to.equal(beforeSignIn.lastLoginAt);
    expect(afterFirstFactor.lastRefreshAt).to.equal(beforeSignIn.lastRefreshAt);
  });

  it("should error if SAMLResponse is missing assertion", async () => {
    const samlResponse = {};

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=saml.saml&id_token=${
          FAKE_GOOGLE_ACCOUNT.idToken
        }&SAMLResponse=${JSON.stringify(samlResponse)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("INVALID_IDP_RESPONSE");
      });
  });

  it("should error if SAMLResponse is missing assertion.subject", async () => {
    const samlResponse = { assertion: {} };

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=saml.saml&id_token=${
          FAKE_GOOGLE_ACCOUNT.idToken
        }&SAMLResponse=${JSON.stringify(samlResponse)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("INVALID_IDP_RESPONSE");
      });
  });

  it("should error if SAMLResponse is missing assertion.subject.nameId", async () => {
    const samlResponse = { assertion: { subject: {} } };

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=saml.saml&id_token=${
          FAKE_GOOGLE_ACCOUNT.idToken
        }&SAMLResponse=${JSON.stringify(samlResponse)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("INVALID_IDP_RESPONSE");
      });
  });

  it("should create an account for generic SAML providers", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=saml.saml&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.isNewUser).to.equal(true);
        expect(res.body.email).to.equal(FAKE_GOOGLE_ACCOUNT.email);
        expect(res.body.emailVerified).to.equal(true);
        expect(res.body.federatedId).to.equal(FAKE_GOOGLE_ACCOUNT.rawId);
        expect(res.body.oauthIdToken).to.equal(FAKE_GOOGLE_ACCOUNT.idToken);
        expect(res.body.providerId).to.equal("saml.saml");
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        // The ID Token used above does NOT contain name or photo, so the
        // account created won't have those attributes either.
        expect(res.body).not.to.have.property("displayName");
        expect(res.body).not.to.have.property("photoUrl");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("identities")
          .eql({
            "saml.saml": [FAKE_GOOGLE_ACCOUNT.rawId],
            email: [FAKE_GOOGLE_ACCOUNT.email],
          });
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("saml.saml");
      });
  });

  it("should include fields in SAMLResponse for SAML providers", async () => {
    const otherEmail = "otherEmail@gmail.com";
    const attributeStatements = {
      name: "Jane Doe",
      mail: "otherOtherEmail@gmail.com",
    };
    const samlResponse = { assertion: { subject: { nameId: otherEmail }, attributeStatements } };

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
      .query({ key: "fake-api-key" })
      .send({
        postBody: `providerId=saml.saml&id_token=${
          FAKE_GOOGLE_ACCOUNT.idToken
        }&SAMLResponse=${JSON.stringify(samlResponse)}`,
        requestUri: "http://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.email).to.equal(otherEmail);

        const rawUserInfo = JSON.parse(res.body.rawUserInfo);
        expect(rawUserInfo).to.eql(attributeStatements);

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_attributes")
          .eql(attributeStatements);
      });
  });

  describe("when blocking functions are present", () => {
    afterEach(() => {
      expect(nock.isDone()).to.be.true;
      nock.cleanAll();
    });

    it("should update modifiable fields for new users for beforeCreate", async () => {
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

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `providerId=google.com&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
          returnSecureToken: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(true);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [FAKE_GOOGLE_ACCOUNT.rawId],
              email: [FAKE_GOOGLE_ACCOUNT.email],
            });

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
        });
    });

    it("should update modifiable fields for new users for beforeSignIn", async () => {
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
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `providerId=google.com&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
          returnSecureToken: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(true);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [FAKE_GOOGLE_ACCOUNT.rawId],
              email: [FAKE_GOOGLE_ACCOUNT.email],
            });

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
          expect(decoded!.payload).to.have.property("sessionAttribute").equals("session");
        });
    });

    it("beforeSignIn fields should overwrite beforeCreate fields for new users", async () => {
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

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `providerId=google.com&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
          returnSecureToken: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(res.body.isNewUser).to.equal(true);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [FAKE_GOOGLE_ACCOUNT.rawId],
              email: [FAKE_GOOGLE_ACCOUNT.email],
            });

          expect(decoded!.payload.name).to.equal(DISPLAY_NAME);
          expect(decoded!.payload.picture).to.equal(PHOTO_URL);
          expect(decoded!.payload.email_verified).to.be.true;
          expect(decoded!.payload).to.have.property("customAttribute").equals("custom");
          expect(decoded!.payload).to.have.property("sessionAttribute").equals("session");
        });
    });

    it("should update modifiable fields for existing users", async () => {
      const user = await registerUser(authApi(), {
        email: "foo@example.com",
        password: "notasecret",
      });
      const claims = fakeClaims({
        sub: "123456789012345678901",
        name: "Foo",
      });
      const fakeIdToken = JSON.stringify(claims);
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
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          idToken: user.idToken,
          postBody: `providerId=google.com&id_token=${encodeURIComponent(fakeIdToken)}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
        })
        .then((res) => {
          expectStatusCode(200, res);
          expect(!!res.body.isNewUser).to.equal(false);

          const idToken = res.body.idToken;
          const decoded = decodeJwt(idToken, { complete: true }) as {
            header: JwtHeader;
            payload: FirebaseJwtPayload;
          } | null;
          expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
          expect(decoded!.header.alg).to.eql("none");
          expect(decoded!.payload.firebase)
            .to.have.property("identities")
            .eql({
              "google.com": [claims.sub],
              email: [user.email],
            });

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

      await authApi()
        .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")
        .query({ key: "fake-api-key" })
        .send({
          postBody: `providerId=google.com&id_token=${FAKE_GOOGLE_ACCOUNT.idToken}`,
          requestUri: "http://localhost",
          returnIdpCredential: true,
          returnSecureToken: true,
        })
        .then((res) => {
          expectStatusCode(400, res);
          expect(res.body.error.message).to.equal("USER_DISABLED");
        });
    });
  });
});
