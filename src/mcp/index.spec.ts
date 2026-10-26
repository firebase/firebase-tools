import { expect } from "chai";
import * as sinon from "sinon";
import * as crossSpawn from "cross-spawn";
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

  it("catches and logs a rejected detectProjectSetup() on start() without an unhandled rejection", async () => {
    const server = new FirebaseMcpServer({});
    const setupStub = sinon.stub(server, "detectProjectSetup").rejects(new Error("setup failure"));
    sinon.stub(server.server, "connect").resolves();
    const errorSpy = sinon.spy();
    sinon.stub(server, "logger").get(() => ({
      debug: sinon.stub(),
      info: sinon.stub(),
      notice: sinon.stub(),
      warning: sinon.stub(),
      error: errorSpy,
      critical: sinon.stub(),
      alert: sinon.stub(),
      emergency: sinon.stub(),
    }));

    await server.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setupStub.calledOnce).to.be.true;
    expect(errorSpy.calledOnce).to.be.true;
    expect(errorSpy.firstCall.args[0]).to.equal("Failed to detect project setup: setup failure");
  });
});

describe("FirebaseMcpServer.mcpGetPrompt", () => {
  let server: FirebaseMcpServer;

  beforeEach(() => {
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    sinon.stub(FirebaseMcpServer.prototype, "detectActiveFeatures").resolves([]);
    sinon.stub(trackModule, "trackGA4").resolves();

    server = new FirebaseMcpServer({ activeFeatures: ["core"] });
    server.clientInfo = { name: "test-client", version: "0.0.0" };
    sinon.stub(server, "getProjectId").resolves(undefined);
    sinon.stub(server, "getAuthenticatedUser").resolves(null);
    sinon.stub(server as any, "safeCheckBillingEnabled").resolves(false);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("uses 'firebase' in prompt instructions and caches command across calls when CLI is present", async () => {
    const syncStub = sinon.stub(crossSpawn, "sync").returns({
      status: 0,
      stdout: Buffer.from("15.34.0"),
      stderr: Buffer.from(""),
      output: [],
      pid: 1234,
      signal: null,
    });

    const res1 = await server.mcpGetPrompt({
      method: "prompts/get",
      params: { name: "firebase:deploy", arguments: { prompt: "deploy" } },
    });
    const content1 = res1.messages[0].content;
    expect(content1.type).to.equal("text");
    if (content1.type === "text") {
      expect(content1.text).to.include("`firebase login`");
    }
    expect(syncStub.calledOnce).to.be.true;
    expect(syncStub.firstCall.args).to.deep.equal([
      "firebase",
      ["--version"],
      { timeout: 2000, stdio: "ignore" },
    ]);

    // Subsequent calls on the same server instance should reuse the cached command
    const res2 = await server.mcpGetPrompt({
      method: "prompts/get",
      params: { name: "firebase:deploy", arguments: { prompt: "deploy" } },
    });
    const content2 = res2.messages[0].content;
    expect(content2.type).to.equal("text");
    if (content2.type === "text") {
      expect(content2.text).to.include("`firebase login`");
    }
    expect(syncStub.calledOnce).to.be.true;
  });

  it("falls back to 'npx firebase-tools@latest' in prompt instructions when CLI check fails", async () => {
    const err = new Error("spawn firebase ENOENT");
    (err as any).code = "ENOENT";
    sinon.stub(crossSpawn, "sync").returns({
      error: err,
      status: null,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      output: [],
      pid: 0,
      signal: null,
    });

    const res = await server.mcpGetPrompt({
      method: "prompts/get",
      params: { name: "firebase:deploy", arguments: { prompt: "deploy" } },
    });
    const content = res.messages[0].content;
    expect(content.type).to.equal("text");
    if (content.type === "text") {
      expect(content.text).to.include("`npx firebase-tools@latest login`");
    }
  });
});
