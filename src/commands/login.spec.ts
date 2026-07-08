import * as sinon from "sinon";
import { expect } from "chai";
import { command as loginCommand } from "./login";
import * as auth from "../auth";
import { configstore } from "../configstore";
import { logger } from "../logger";
import * as utils from "../utils";
import { FirebaseError } from "../error";

describe("login", () => {
  let sandbox: sinon.SinonSandbox;
  let configstoreGetStub: sinon.SinonStub;
  let configstoreSetStub: sinon.SinonStub;
  let configstoreDeleteStub: sinon.SinonStub;
  let loginRemotelyStartStub: sinon.SinonStub;
  let loginRemotelyCompleteStub: sinon.SinonStub;
  let recordCredentialsStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let logSuccessStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    (loginCommand as any).befores = []; // Bypass pre-action hooks

    configstoreGetStub = sandbox.stub(configstore, "get");
    configstoreSetStub = sandbox.stub(configstore, "set");
    configstoreDeleteStub = sandbox.stub(configstore, "delete");

    loginRemotelyStartStub = sandbox.stub(auth, "loginRemotelyStart");
    loginRemotelyCompleteStub = sandbox.stub(auth, "loginRemotelyComplete");
    recordCredentialsStub = sandbox.stub(auth, "recordCredentials");

    loggerInfoStub = sandbox.stub(logger, "info");
    logSuccessStub = sandbox.stub(utils, "logSuccess");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("non-interactive start flow", () => {
    it("should print login URL and save PKCE state when non-interactive and no authCode", async () => {
      loginRemotelyStartStub.resolves({
        sessionId: "fake-session-uuid",
        sessionIdPrefix: "FAKE-",
        loginUrl: "https://fake.login.url",
        codeVerifier: "fake-code-verifier",
      });

      await loginCommand.runner()(undefined, {
        nonInteractive: true,
      });

      expect(loginRemotelyStartStub.calledOnce).to.be.true;
      expect(
        configstoreSetStub.calledWith("tempLoginState", {
          sessionId: "fake-session-uuid",
          codeVerifier: "fake-code-verifier",
        }),
      ).to.be.true;

      expect(loggerInfoStub.calledWith(sinon.match("To sign in to the Firebase CLI:"))).to.be.true;
      expect(loggerInfoStub.calledWith(sinon.match("FAKE-"))).to.be.true;
      expect(loggerInfoStub.calledWith(sinon.match("https://fake.login.url"))).to.be.true;
      expect(loggerInfoStub.calledWith(sinon.match("firebase login <authorizationCode>"))).to.be
        .true;
    });
  });

  describe("authCode completion flow", () => {
    it("should complete the login using stored codeVerifier and delete temp state on success", async () => {
      configstoreGetStub.withArgs("tempLoginState").returns({
        sessionId: "fake-session-uuid",
        codeVerifier: "fake-code-verifier",
      });

      const fakeUserCreds = {
        user: { email: "user@example.com" },
        tokens: { refresh_token: "fake-token" },
        scopes: [],
      };
      loginRemotelyCompleteStub.resolves(fakeUserCreds);

      await loginCommand.runner()("my-auth-code", {
        nonInteractive: true,
      });

      expect(loginRemotelyCompleteStub.calledWith("my-auth-code", "fake-code-verifier")).to.be.true;
      expect(recordCredentialsStub.calledWith(fakeUserCreds)).to.be.true;
      expect(configstoreDeleteStub.calledWith("tempLoginState")).to.be.true;
      expect(logSuccessStub.calledWith(sinon.match("Success! Logged in as user@example.com"))).to.be
        .true;
    });

    it("should delete temp state and throw FirebaseError if exchange fails", async () => {
      configstoreGetStub.withArgs("tempLoginState").returns({
        sessionId: "fake-session-uuid",
        codeVerifier: "fake-code-verifier",
      });

      loginRemotelyCompleteStub.rejects(new Error("Exchange failed"));

      await expect(
        loginCommand.runner()("my-auth-code", {
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "Login failed: Exchange failed");

      expect(configstoreDeleteStub.calledWith("tempLoginState")).to.be.true;
    });

    it("should throw error if authCode provided but no stored login state exists", async () => {
      configstoreGetStub.withArgs("tempLoginState").returns(undefined);

      await expect(
        loginCommand.runner()("my-auth-code", {
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "No pending login session found");
    });
  });
});
