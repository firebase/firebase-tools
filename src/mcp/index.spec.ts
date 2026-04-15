import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseMcpServer } from "./index";
import * as requireAuthModule from "../requireAuth";

describe("FirebaseMcpServer.getAuthenticatedUser", () => {
  let server: FirebaseMcpServer;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock the methods that may cause hanging BEFORE creating the instance
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    sinon.stub(FirebaseMcpServer.prototype, "detectActiveFeatures").resolves([]);

    server = new FirebaseMcpServer({});

    // Mock the resolveOptions method to avoid dependency issues
    sinon.stub(server, "resolveOptions").resolves({});

    requireAuthStub = sinon.stub(requireAuthModule, "requireAuth");
  });

  afterEach(() => {
    sinon.restore();
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
