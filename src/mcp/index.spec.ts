import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseMcpServer } from "./index";
import * as requireAuthModule from "../requireAuth";
import * as trackModule from "../track";

describe("FirebaseMcpServer", () => {
  let server: FirebaseMcpServer;

  beforeEach(() => {
    // Mock the methods that may cause hanging BEFORE creating the instance
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    sinon.stub(FirebaseMcpServer.prototype, "detectActiveFeatures").resolves([]);

    server = new FirebaseMcpServer({});
  });

  afterEach(() => {
    sinon.restore();
    delete process.env.IS_GEMINI_CLI_EXTENSION;
  });

  describe("trackGA4", () => {
    let trackGA4Stub: sinon.SinonStub;

    beforeEach(() => {
      trackGA4Stub = sinon.stub(trackModule, "trackGA4");
      server["_ready"] = true;
      server.clientInfo = { name: "test-client", version: "1.0.0" };
    });

    afterEach(() => {
      trackGA4Stub.restore();
    });

    it("should set gemini_cli_extension to true when IS_GEMINI_CLI_EXTENSION is set", async () => {
      process.env.IS_GEMINI_CLI_EXTENSION = "true";

      // It's a private method, so we have to access it this way.
      await (server as any).trackGA4("test_event");

      expect(trackGA4Stub.calledOnce).to.be.true;
      expect(trackGA4Stub.firstCall.args[1]).to.deep.include({
        gemini_cli_extension: "true",
      });
    });

    it("should set gemini_cli_extension to false when IS_GEMINI_CLI_EXTENSION is not set", async () => {
      // It's a private method, so we have to access it this way.
      await (server as any).trackGA4("test_event");

      expect(trackGA4Stub.calledOnce).to.be.true;
      expect(trackGA4Stub.firstCall.args[1]).to.deep.include({
        gemini_cli_extension: "false",
      });
    });
  });

  describe("getAuthenticatedUser", () => {
    let requireAuthStub: sinon.SinonStub;

    beforeEach(() => {
      // Mock the resolveOptions method to avoid dependency issues
      sinon.stub(server, "resolveOptions").resolves({});

      requireAuthStub = sinon.stub(requireAuthModule, "requireAuth");
    });

    it("should return email when authenticated user is present", async () => {
      const testEmail = "test@example.com";
      requireAuthStub.resolves(testEmail);

      const result = await server.getAuthenticatedUser();

      expect(result).to.equal(testEmail);
      expect(requireAuthStub.calledOnce).to.be.true;
    });

    it("should return null when no user and skipAutoAuth is true", async () => {
      requireAuthStub.resolves(null);

      const result = await server.getAuthenticatedUser(true);

      expect(result).to.be.null;
      expect(requireAuthStub.calledOnce).to.be.true;
    });

    it("should return 'Application Default Credentials' when no user and skipAutoAuth is false", async () => {
      requireAuthStub.resolves(null);

      const result = await server.getAuthenticatedUser(false);

      expect(result).to.equal("Application Default Credentials");
      expect(requireAuthStub.calledOnce).to.be.true;
    });

    it("should return null when requireAuth throws an error", async () => {
      requireAuthStub.rejects(new Error("Auth failed"));

      const result = await server.getAuthenticatedUser();

      expect(result).to.be.null;
      expect(requireAuthStub.calledOnce).to.be.true;
    });
  });
});
