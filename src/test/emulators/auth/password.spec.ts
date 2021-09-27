import { expect } from "chai";
import { decode as decodeJwt, JwtHeader } from "jsonwebtoken";
import { FirebaseJwtPayload } from "../../../emulator/auth/operations";
import { describeAuthEmulator } from "./setup";
import {
  deleteAccount,
  expectStatusCode,
  getAccountInfoByLocalId,
  registerUser,
  TEST_MFA_INFO,
  updateAccountByLocalId,
  updateProjectConfig,
} from "./helpers";

describeAuthEmulator("accounts:signInWithPassword", ({ authApi, getClock }) => {
  it("should issue tokens when email and password are valid", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: user.password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).equals(localId);
        expect(res.body.email).equals(user.email);
        expect(res.body).to.have.property("registered").equals(true);
        expect(res.body).to.have.property("refreshToken").that.is.a("string");

        const idToken = res.body.idToken;
        const decoded = decodeJwt(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        expect(decoded, "JWT returned by emulator is invalid").not.to.be.null;
        expect(decoded!.header.alg).to.eql("none");
        expect(decoded!.payload.user_id).to.equal(localId);
        expect(decoded!.payload).not.to.have.property("provider_id");
        expect(decoded!.payload.firebase).to.have.property("sign_in_provider").equals("password");
      });
  });

  it("should update lastLoginAt on successful login", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);

    const beforeLogin = await getAccountInfoByLocalId(authApi(), localId);
    expect(beforeLogin.lastLoginAt).to.equal(Date.now().toString());

    getClock().tick(4000);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: user.password })
      .then((res) => {
        expectStatusCode(200, res);
      });

    const afterLogin = await getAccountInfoByLocalId(authApi(), localId);
    expect(afterLogin.lastLoginAt).to.equal(Date.now().toString());
  });

  it("should validate email address ignoring case", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "AlIcE@exAMPle.COM", password: user.password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.localId).equals(localId);
      });
  });

  it("should error if email or password is missing", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ /* no email */ password: "notasecret" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).equals("MISSING_EMAIL");
      });
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "nosuchuser@example.com" /* no password */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).equals("MISSING_PASSWORD");
      });
  });

  it("should error if email is not found", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: "nosuchuser@example.com", password: "notasecret" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).equals("EMAIL_NOT_FOUND");
      });
  });

  it("should error if password is wrong", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    await registerUser(authApi(), user);
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      // Passwords are case sensitive. The uppercase one below doesn't match.
      .send({ email: user.email, password: "NOTASECRET" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).equals("INVALID_PASSWORD");
      });
  });

  it("should error if user is disabled", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId } = await registerUser(authApi(), user);
    await updateAccountByLocalId(authApi(), localId, { disableUser: true });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: "notasecret" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("USER_DISABLED");
      });
  });

  it("should return pending credential if user has MFA", async () => {
    const user = {
      email: "alice@example.com",
      password: "notasecret",
      mfaInfo: [TEST_MFA_INFO],
    };
    await registerUser(authApi(), user);

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: user.password })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("idToken");
        expect(res.body).not.to.have.property("refreshToken");
        expect(res.body.mfaPendingCredential).to.be.a("string");
        expect(res.body.mfaInfo).to.be.an("array").with.lengthOf(1);
      });
  });

  it("should error if usageMode is passthrough", async () => {
    const user = { email: "alice@example.com", password: "notasecret" };
    const { localId, idToken } = await registerUser(authApi(), user);
    await deleteAccount(authApi(), { idToken });
    await updateProjectConfig(authApi(), { usageMode: "PASSTHROUGH" });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")
      .query({ key: "fake-api-key" })
      .send({ email: user.email, password: user.password })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("UNSUPPORTED_PASSTHROUGH_OPERATION");
      });
  });
});
