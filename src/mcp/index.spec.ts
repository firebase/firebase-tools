import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseMcpServer } from "./index";
import * as requireAuthModule from "../requireAuth";
import * as trackModule from "../track";
import { ServerTool } from "./tool";

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

describe("FirebaseMcpServer.mcpCallTool", () => {
  let server: FirebaseMcpServer;
  let toolFn: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    sinon.stub(FirebaseMcpServer.prototype, "detectActiveFeatures").resolves([]);
    sinon.stub(trackModule, "trackGA4").resolves();

    server = new FirebaseMcpServer({});
    server.clientInfo = { name: "test-client", version: "0.0.0" };

    sinon.stub(server, "getProjectId").resolves(undefined);
    sinon.stub(server, "getAuthenticatedUser").resolves(null);
    sinon.stub(server as any, "safeCheckBillingEnabled").resolves(false);
    sinon.stub(server as any, "_createMcpContext").returns({});

    toolFn = sinon.stub().resolves({ content: [{ type: "text", text: "ok" }] });
    sinon.stub(server, "getTool").resolves({
      mcp: {
        name: "test_tool",
        inputSchema: {},
        _meta: { optionalProjectDir: true },
      },
      fn: toolFn,
      isAvailable: async () => true,
    } as ServerTool);
  });

  afterEach(() => {
    sinon.restore();
  });

  // Locks in the normalization of missing `request.params.arguments` to `{}`.
  // Clients are allowed to omit `arguments` for tools with no required inputs;
  // without this guard, the tool would receive `undefined` and crash on access.
  it("passes `{}` to the tool when the client omits arguments", async () => {
    const result = await server.mcpCallTool({
      method: "tools/call",
      params: { name: "test_tool" },
    } as any);

    expect(toolFn.calledOnce).to.be.true;
    expect(toolFn.firstCall.args[0]).to.deep.equal({});
    expect(result).to.deep.equal({ content: [{ type: "text", text: "ok" }] });
  });

  it("passes provided arguments through unchanged", async () => {
    await server.mcpCallTool({
      method: "tools/call",
      params: { name: "test_tool", arguments: { foo: "bar" } },
    } as any);

    expect(toolFn.firstCall.args[0]).to.deep.equal({ foo: "bar" });
  });
});

describe("FirebaseMcpServer lifecycle", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("does not trigger project setup or feature detection on construction", () => {
    const setupSpy = sinon.spy(FirebaseMcpServer.prototype, "detectProjectSetup");
    const rootSpy = sinon.spy(FirebaseMcpServer.prototype, "detectProjectRoot");
    const featuresSpy = sinon.spy(FirebaseMcpServer.prototype, "detectActiveFeatures");

    new FirebaseMcpServer({});

    expect(setupSpy.called).to.be.false;
    expect(rootSpy.called).to.be.false;
    expect(featuresSpy.called).to.be.false;
  });

  it("triggers project setup when start() is called", async () => {
    const server = new FirebaseMcpServer({});
    const setupStub = sinon.stub(server, "detectProjectSetup").resolves();
    const connectStub = sinon.stub(server.server, "connect").resolves();

    await server.start();

    expect(setupStub.calledOnce).to.be.true;
    expect(connectStub.calledOnce).to.be.true;
  });

  it("handles rejection in background project detection without unhandled rejection", async () => {
    sinon
      .stub(FirebaseMcpServer.prototype, "detectProjectSetup")
      .rejects(new Error("detection failed"));
    const server = new FirebaseMcpServer({});
    sinon.stub(server.server, "connect").resolves();
    const debugStub = sinon.stub();
    sinon.stub(server, "logger").get(() => ({
      debug: debugStub,
    }));

    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(debugStub.calledOnce).to.be.true;
    expect(debugStub.firstCall.args[0]).to.include("Background project detection failed");
  });
});
