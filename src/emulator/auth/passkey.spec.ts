import { expect } from "chai";
import { expectStatusCode, registerUser } from "./testing/helpers";
import { describeAuthEmulator } from "./testing/setup";

describeAuthEmulator("passkey (WebAuthn) support", ({ authApi }) => {
  it("should initialize passkey enrollment and return options", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "passkey-user@example.com",
      password: "password123",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.credentialCreationOptions).to.be.an("object");
        expect(res.body.credentialCreationOptions.rp.id).to.equal("localhost");
        expect(res.body.credentialCreationOptions.challenge).to.be.a("string");
      });
  });

  it("should finalize passkey enrollment and return tokens", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "passkey-user-2@example.com",
      password: "password123",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        authenticatorRegistrationResponse: { id: "test_credential_id_1" },
        name: "My Security Key",
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
        expect(res.body.refreshToken).to.be.a("string");
        expect(res.body.localId).to.be.a("string");
      });

    // Check lookup returns the enrolled passkey
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        const user = res.body.users[0];
        expect(user.passkeyInfo).to.be.an("array").of.length(1);
        expect(user.passkeyInfo[0].credentialId).to.equal("test_credential_id_1");
        expect(user.passkeyInfo[0].name).to.equal("My Security Key");
      });
  });

  it("should respond to passkey sign in start options", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeySignIn:start")
      .query({ key: "fake-api-key" })
      .send({})
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.credentialRequestOptions).to.be.an("object");
        expect(res.body.credentialRequestOptions.challenge).to.be.a("string");
        expect(res.body.credentialRequestOptions.rpId).to.equal("localhost");
      });
  });

  it("should sign in using a registered passkey", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "passkey-user-3@example.com",
      password: "password123",
    });

    // Enroll passkey first
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        authenticatorRegistrationResponse: { id: "test_credential_id_3" },
        name: "My Key",
      });

    // Try finalizing sign in
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeySignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({
        authenticatorAuthenticationResponse: { id: "test_credential_id_3" },
      })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.idToken).to.be.a("string");
        expect(res.body.refreshToken).to.be.a("string");
      });
  });

  it("should fail sign in if passkey is not registered", async () => {
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeySignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({
        authenticatorAuthenticationResponse: { id: "nonexistent_cred_id" },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("PASSKEY_CREDENTIAL_NOT_FOUND");
      });
  });

  it("should delete (unenroll) a passkey via setAccountInfo", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "passkey-user-4@example.com",
      password: "password123",
    });

    // Enroll two passkeys
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        authenticatorRegistrationResponse: { id: "cred_4_A" },
        name: "Key A",
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        authenticatorRegistrationResponse: { id: "cred_4_B" },
        name: "Key B",
      });

    // Unenroll Key A
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        deletePasskey: ["cred_4_A"],
      })
      .then((res) => {
        expectStatusCode(200, res);
      });

    // Look up and verify only Key B remains
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        const user = res.body.users[0];
        expect(user.passkeyInfo).to.be.an("array").of.length(1);
        expect(user.passkeyInfo[0].credentialId).to.equal("cred_4_B");
        expect(user.passkeyInfo[0].name).to.equal("Key B");
      });
  });

  it("should support name fallback to displayName and Unnamed Passkey during enrollment", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "passkey-fallback@example.com",
      password: "password123",
      displayName: "My Display Name",
    });

    // Test fallback to displayName
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        authenticatorRegistrationResponse: { id: "fallback_cred_1" },
        displayName: "My Display Name",
      })
      .then((res) => {
        expectStatusCode(200, res);
      });

    // Test fallback to "Unnamed Passkey"
    const { idToken: idToken2 } = await registerUser(authApi(), {
      email: "passkey-fallback-2@example.com",
      password: "password123",
    });
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken: idToken2,
        authenticatorRegistrationResponse: { id: "fallback_cred_2" },
      })
      .then((res) => {
        expectStatusCode(200, res);
      });

    // Verify both names in database
    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
      .query({ key: "fake-api-key" })
      .send({ idToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users[0].passkeyInfo[0].name).to.equal("My Display Name");
      });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:lookup")
      .query({ key: "fake-api-key" })
      .send({ idToken: idToken2 })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users[0].passkeyInfo[0].name).to.equal("Unnamed Passkey");
      });
  });

  it("should fail start/finalize endpoints if required fields are missing", async () => {
    // Missing idToken in enrollment start
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:start")
      .query({ key: "fake-api-key" })
      .send({})
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_ID_TOKEN");
      });

    // Missing idToken in enrollment finalize
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        authenticatorRegistrationResponse: { id: "some_cred" },
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_ID_TOKEN");
      });

    // Missing authenticatorRegistrationResponse in enrollment finalize
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeyEnrollment:finalize")
      .query({ key: "fake-api-key" })
      .send({
        idToken: "some_token",
      })
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_AUTHENTICATOR_RESPONSE");
      });

    // Missing authenticatorAuthenticationResponse in sign-in finalize
    await authApi()
      .post("/identitytoolkit.googleapis.com/v2/accounts/passkeySignIn:finalize")
      .query({ key: "fake-api-key" })
      .send({})
      .then((res) => {
        expectStatusCode(400, res);
        expect(res.body.error.message).to.equal("MISSING_AUTHENTICATOR_RESPONSE");
      });
  });

  it("should safely handle deleting a passkey when user has no passkeys", async () => {
    const { idToken } = await registerUser(authApi(), {
      email: "passkey-no-keys@example.com",
      password: "password123",
    });

    await authApi()
      .post("/identitytoolkit.googleapis.com/v1/accounts:update")
      .query({ key: "fake-api-key" })
      .send({
        idToken,
        deletePasskey: ["nonexistent_key"],
      })
      .then((res) => {
        expectStatusCode(200, res);
      });
  });
});
