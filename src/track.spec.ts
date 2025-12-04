import { expect } from "chai";
import * as sinon from "sinon";
import nock from "nock";
import { configstore } from "./configstore";
import * as track from "./track";
import * as auth from "./auth";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json");

describe("track", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let configstoreGetStub: sinon.SinonStub;
  let configstoreSetStub: sinon.SinonStub;
  let getGlobalDefaultAccountStub: sinon.SinonStub;

  beforeEach(() => {
    configstoreGetStub = sandbox.stub(configstore, "get");
    configstoreSetStub = sandbox.stub(configstore, "set");
    getGlobalDefaultAccountStub = sandbox.stub(auth, "getGlobalDefaultAccount");
    nock.disableNetConnect();
  });

  afterEach(() => {
    sandbox.restore();
    nock.enableNetConnect();
    delete process.env.IS_FIREBASE_CLI;
    delete process.env.IS_FIREBASE_MCP;
    delete process.env.FIREBASE_CLI_MP_VALIDATE;
    track.GA4_PROPERTIES.cli.currentSession = undefined;
    track.GA4_PROPERTIES.emulator.currentSession = undefined;
    track.GA4_PROPERTIES.vscode.currentSession = undefined;
  });

  describe("usageEnabled", () => {
    it("should return true if usage is enabled and IS_FIREBASE_CLI is true", () => {
      process.env.IS_FIREBASE_CLI = "true";
      configstoreGetStub.withArgs("usage").returns(true);
      expect(track.usageEnabled()).to.be.true;
    });

    it("should return true if usage is enabled and IS_FIREBASE_MCP is true", () => {
      process.env.IS_FIREBASE_MCP = "true";
      configstoreGetStub.withArgs("usage").returns(true);
      expect(track.usageEnabled()).to.be.true;
    });

    it("should return false if usage is disabled", () => {
      process.env.IS_FIREBASE_CLI = "true";
      configstoreGetStub.withArgs("usage").returns(false);
      expect(track.usageEnabled()).to.be.false;
    });

    it("should return false if not in CLI or MCP", () => {
      configstoreGetStub.withArgs("usage").returns(true);
      expect(track.usageEnabled()).to.be.false;
    });
  });

  describe("track", () => {
    beforeEach(() => {
      process.env.IS_FIREBASE_CLI = "true";
      configstoreGetStub.withArgs("usage").returns(true);
      configstoreGetStub.withArgs("analytics-uuid").returns("test-uuid");
    });

    afterEach(() => {
      nock.cleanAll();
    });

    it("should send a GA4 request for trackGA4", async () => {
      const scope = nock("https://www.google-analytics.com")
        .post("/mp/collect")
        .query(true)
        .reply(204);

      await track.trackGA4("command_execution", { command_name: "test" });

      expect(scope.isDone()).to.be.true;
    });

    it("should send a GA4 request for trackEmulator", async () => {
      const scope = nock("https://www.google-analytics.com")
        .post("/mp/collect")
        .query(true)
        .reply(204);

      await track.trackEmulator("emulator_usage", { emulator_name: "test" });

      expect(scope.isDone()).to.be.true;
    });

    it("should send a GA4 request for trackVSCode", async () => {
      const scope = nock("https://www.google-analytics.com")
        .post("/mp/collect")
        .query(true)
        .reply(204);

      await track.trackVSCode("vscode_event", { some_param: "test" });

      expect(scope.isDone()).to.be.true;
    });

    it("should include user properties in the request", async () => {
      let requestBody: any;
      const scope = nock("https://www.google-analytics.com")
        .post("/mp/collect")
        .query(true)
        .reply(204, (uri, body) => {
          requestBody = body;
        });

      await track.trackGA4("command_execution", { command_name: "test" });

      expect(scope.isDone()).to.be.true;
      expect(requestBody.user_properties.node_platform.value).to.equal(process.platform);
      expect(requestBody.user_properties.node_version.value).to.equal(process.version);
      expect(requestBody.user_properties.cli_version.value).to.equal(pkg.version);
    });

    it("should handle validation mode", async () => {
      process.env.FIREBASE_CLI_MP_VALIDATE = "true";
      const scope = nock("https://www.google-analytics.com")
        .post("/debug/mp/collect")
        .query(true)
        .reply(200, { validationMessages: [] });

      await track.trackGA4("command_execution", { command_name: "test" });

      expect(scope.isDone()).to.be.true;
    });
  });

  describe("session", () => {
    beforeEach(() => {
      process.env.IS_FIREBASE_CLI = "true";
      configstoreGetStub.withArgs("usage").returns(true);
    });

    it("should create a new client ID if one does not exist", () => {
      configstoreGetStub.withArgs("analytics-uuid").returns(undefined);
      const session = track.cliSession();
      expect(session).to.not.be.undefined;
      expect(configstoreSetStub).to.have.been.calledOnce;
      expect(configstoreSetStub.getCall(0).args[0]).to.equal("analytics-uuid");
    });

    it("should use an existing client ID if one exists", () => {
      configstoreGetStub.withArgs("analytics-uuid").returns("test-uuid");
      const session = track.cliSession();
      expect(session?.clientId).to.equal("test-uuid");
      expect(configstoreSetStub).to.not.have.been.called;
    });

    it("should cache the session object", () => {
      const session1 = track.cliSession();
      const session2 = track.cliSession();
      expect(session1).to.equal(session2);
    });

    describe("debugMode", () => {
      it("should be true for @google.com accounts with tsconfig.json", () => {
        getGlobalDefaultAccountStub.returns({ user: { email: "test@google.com" } });
        // We can't directly test the require, so we'll just check the outcome.
        const session = track.cliSession();
        expect(session?.debugMode).to.be.true;
      });

      it("should be false for non-@google.com accounts", () => {
        getGlobalDefaultAccountStub.returns({ user: { email: "test@example.com" } });
        const session = track.cliSession();
        expect(session?.debugMode).to.be.false;
      });
    });
  });
});
