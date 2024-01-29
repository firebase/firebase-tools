import { expect } from "chai";
import { decode as decodeJwt, sign as signJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload, CUSTOM_TOKEN_AUDIENCE } from "../../../emulator/auth/operations";
import { PROVIDER_CUSTOM } from "../../../emulator/auth/state";
import { describeAuthEmulator, PROJECT_ID } from "./setup";
import {
  expectStatusCode,
  getAccountInfoByIdToken,
  updateAccountByLocalId,
  signInWithEmailLink,
  registerTenant,
} from "./helpers";

describeAuthEmulator("sign-in with custom token", ({ authApi }) => {
  it("should create new account from custom token (unsigned)", async () => {
    const uid = "someuid";
    const claims = { abc: "def", ultimate: { answer: 42 } };
    const token = signJwt({ uid, claims }, "fake-secret", {
      algorithm: "none",
      expiresIn: 3600,

      subject: "fake-service-account@example.com",
      issuer: "fake-service-account@example.com",
      audience: CUSTOM_TOKEN_AUDIENCE,
    });
    const idToken = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.isNewUser).to.equal(true);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken as string;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals(PROVIDER_CUSTOM);
        expect(decoded!.payload).deep.include(claims);
        return idToken;
      });

    const info = await getAccountInfoByIdToken(authApi(), idToken);
    expect(info.localId).to.equal(uid);
  });

  it("should sign into existing account and merge claims", async () => {
    // Given an email sign-in user with some custom claims:
    const email = "alice@example.com";
    const { localId } = await signInWithEmailLink(authApi(), email);
    const customClaims = { abc: "abc", foo: "bar" };
    await updateAccountByLocalId(authApi(), localId, {
      customAttributes: JSON.stringify(customClaims),
    });

    const claims = { abc: "def", ultimate: { answer: 42 } };
    const token = JSON.stringify({ uid: localId, claims });
    const refreshToken = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.isNewUser).to.equal(false);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken as string;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase)
          .to.have.property("sign_in_provider")
          .equals(PROVIDER_CUSTOM);
        expect(decoded!.payload.firebase.identities).to.eql({
          email: [email],
        });
        expect(decoded!.payload).to.deep.include({
          // Claim values in custom token takes precedence over account-level.
          ...customClaims,
          ...claims,
        });
        return res.body.refreshToken as string;
      });

    // The claims also get attached to refreshed ID tokens.
    await authApi()
      .post("/securetoken.googleapis.com/v1/token")
      .type("form")
      .send({ refreshToken, grantType: "refresh_token" })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        const idToken = res.body.id_token;
        expect(idToken).to.be.a("string");
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.payload).to.deep.include({
          ...customClaims,
          ...claims,
        });
      });
  });

  it("should error if custom token is missing", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({
        /* no token */
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_CUSTOM_TOKEN");
      });
  });

  it("should error if custom token is invalid", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token: "{not+Json,That's=>For@Sure}" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("INVALID_CUSTOM_TOKEN");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token: "ThisMayLookLikeAJWT.ButItWontDecode.ToJsonObjects" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("INVALID_CUSTOM_TOKEN");
      });
  });

  it("should error if custom token addresses the wrong audience", async () => {
    const token = signJwt({ uid: "foo" }, "fake-secret", {
      algorithm: "none",
      expiresIn: 3600,

      subject: "fake-service-account@example.com",
      issuer: "fake-service-account@example.com",
      audience: "http://localhost/not-the-firebase-auth-audience",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("INVALID_CUSTOM_TOKEN");
      });
  });

  it("should error if custom token contains no uid", async () => {
    const token = signJwt(
      {
        /* no uid */
      },
      "fake-secret",
      {
        algorithm: "none",
        expiresIn: 3600,

        subject: "fake-service-account@example.com",
        issuer: "fake-service-account@example.com",
        audience: CUSTOM_TOKEN_AUDIENCE,
      },
    );

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("MISSING_IDENTIFIER");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token: '{"look": "I do not have uid"}' })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("MISSING_IDENTIFIER");
      });
  });

  it("should error if custom token contains forbidden claims", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      // Contains forbidden claim "firebase".
      .send({ token: '{"uid": "wow", "claims": {"firebase": "awesome"}}' })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("FORBIDDEN_CLAIM : firebase");
      });
  });

  it("should error if user is disabled", async () => {
    // Given an email sign-in user with some custom claims:
    const email = "alice@example.com";
    const { localId } = await signInWithEmailLink(authApi(), email);
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    const claims = { abc: "def", ultimate: { answer: 42 } };
    const token = JSON.stringify({ uid: localId, claims });
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equal("USER_DISABLED");
      });
  });

  it("should error if auth is disabled", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({
        tenantId: tenant.tenantId,
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("PROJECT_DISABLED");
      });
  });

  it("should error if custom token tenantId does not match", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: false });
    const uid = "someuid";
    const claims = { abc: "def", ultimate: { answer: 42 } };
    const token = signJwt({ uid, claims, tenant_id: "not-matching-tenant-id" }, "fake-secret", {
      algorithm: "none",
      expiresIn: 3600,

      subject: "fake-service-account@example.com",
      issuer: "fake-service-account@example.com",
      audience: CUSTOM_TOKEN_AUDIENCE,
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token, tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.include("TENANT_ID_MISMATCH");
      });
  });

  it("should create a new account from custom token with tenantId", async () => {
    const tenant = await registerTenant(authApi(), PROJECT_ID, { disableAuth: false });
    const uid = "someuid";
    const claims = { abc: "def", ultimate: { answer: 42 } };
    const token = signJwt({ uid, claims, tenant_id: tenant.tenantId }, "fake-secret", {
      algorithm: "none",
      expiresIn: 3600,

      subject: "fake-service-account@example.com",
      issuer: "fake-service-account@example.com",
      audience: CUSTOM_TOKEN_AUDIENCE,
    });

    const idToken = await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken")
      .query({ key: "fake-api-key" })
      .send({ token, tenantId: tenant.tenantId })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.isNewUser).to.equal(true);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        return res.body.idToken as string;
      });

    const info = await getAccountInfoByIdToken(authApi(), idToken, tenant.tenantId);
    expect(info.tenantId).to.equal(tenant.tenantId);
  });
});
