import { expect } from "chai";
import { describeAuthEmulator } from "./setup";
import {
  expectStatusCode,
  registerUser,
  signInWithFakeClaims,
  getSigninMethods,
  expectUserNotExistsForIdToken,
  updateProjectConfig,
  deleteAccount,
} from "./helpers";

describeAuthEmulator("accounts:delete", ({ authApi }) => {
  it("should delete the user of the idToken", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .send({ idToken })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("error");
      });

    await expectUserNotExistsForIdToken(authApi(), idToken);
  });

  it("should error when trying to delete by localId without OAuth", async () => {
    const { localId } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .send({ localId })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_ID_TOKEN");
      });
  });

  it("should remove federated accounts for user", async () => {
    const email = "alice@example.com";
    const providerId = "google.com";
    const sub = "12345";
    const { localId, idToken } = await signInWithFakeClaims(authApi(), providerId, {
      sub,
      email,
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("error");
      });

    expect(await getSigninMethods(authApi(), email)).to.be.empty;

    const signInAgain = await signInWithFakeClaims(authApi(), providerId, {
      sub,
      email,
    });
    expect(signInAgain.localId).not.to.equal(localId);
  });

  it("should delete the user by localId if OAuth credentials are present", async () => {
    const { localId, idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .set("Authorization", "Bearer owner")
      .send({ localId })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body).not.to.have.property("error");
      });

    await expectUserNotExistsForIdToken(authApi(), idToken);
  });

  it("should error if missing localId when OAuth credentials are present", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .set("Authorization", "Bearer owner")
      .send({ idToken /* no localId */ })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("MISSING_LOCAL_ID");
      });
  });

  it("should error on delete with idToken if usageMode is passthrough", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "alice@example.com",
      password: "notasecret",
    });
    await deleteAccount(authApi(), { idToken });
    await updateProjectConfig(authApi(), { usageMode: "PASSTHROUGH" });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .send({ idToken })
      .query({ key: "fake-api-key" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error)
          .to.have.property("message")
          .equals("UNSUPPORTED_PASSTHROUGH_OPERATION");
      });
  });

  it("should return not found on delete with localId if usageMode is passthrough", async () => {
    await updateProjectConfig(authApi(), { usageMode: "PASSTHROUGH" });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:delete")
      .set("Authorization", "Bearer owner")
      .send({ localId: "does-not-exist" })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error).to.have.property("message").equals("USER_NOT_FOUND");
      });
  });
});
