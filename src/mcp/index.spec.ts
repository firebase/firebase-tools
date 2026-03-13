import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseMcpServer } from "./index";
import * as requireAuthModule from "../requireAuth";
import * as cloudbilling from "../gcp/cloudbilling";
import * as availability from "./util/availability";

describe("FirebaseMcpServer.getAuthenticatedUser", () => {
  let server: FirebaseMcpServer;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    server = new FirebaseMcpServer({ activeFeatures: ["core"] });

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

describe("FirebaseMcpServer.getProjectId", () => {
  let server: FirebaseMcpServer;

  beforeEach(() => {
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    server = new FirebaseMcpServer({ activeFeatures: ["core"] });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should prefer credential project over configured default project", async () => {
    sinon.stub(server, "resolveOptions").resolves({ project: "project-a", projectId: "project-a" });
    sinon.stub(server as any, "getProjectIdFromCredentials").returns("project-b");

    const projectId = await server.getProjectId();

    expect(projectId).to.equal("project-b");
  });

  it("should use configured project when no credential project is available", async () => {
    sinon.stub(server, "resolveOptions").resolves({ project: "project-a", projectId: "project-a" });
    sinon.stub(server as any, "getProjectIdFromCredentials").returns(undefined);

    const projectId = await server.getProjectId();

    expect(projectId).to.equal("project-a");
  });
});

describe("FirebaseMcpServer.detectActiveFeatures", () => {
  let server: FirebaseMcpServer;

  beforeEach(() => {
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    server = new FirebaseMcpServer({ activeFeatures: ["core"] });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should continue feature detection when billing check fails", async () => {
    sinon.stub(server, "getProjectId").resolves("project-a");
    sinon.stub(server, "getAuthenticatedUser").resolves("adc@example.com");
    sinon.stub(cloudbilling, "checkBillingEnabled").rejects(new Error("permission denied"));
    sinon.stub(server as any, "_createMcpContext").returns({} as any);
    sinon.stub(availability, "getDefaultFeatureAvailabilityCheck").returns(async () => false);

    const features = await server.detectActiveFeatures();

    expect(features).to.deep.equal([]);
  });
});
