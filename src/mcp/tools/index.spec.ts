import { expect } from "chai";
import * as sinon from "sinon";
import { McpContext } from "../types";
import { availableTools, getRemoteToolsByFeature } from "./index";
import { ONEMCP_SERVERS } from "../onemcp/index";
import { OneMcpServer } from "../onemcp/onemcp_server";

describe("availableTools", () => {
  const mockContext: McpContext = {
    projectId: "test-project",
    accountEmail: "test@example.com",
    config: {} as any,
    host: {
      logger: {
        debug: () => void 0,
        info: () => void 0,
        warn: () => void 0,
        error: () => void 0,
      },
    } as any,
    rc: {} as any,
    firebaseCliCommand: "firebase",
    isBillingEnabled: true,
  };

  it("should return specific tools when enabledTools is provided", async () => {
    const tools = await availableTools(mockContext, [], [], ["firebase_login"]);

    expect(tools).to.have.length(1);
    expect(tools[0].mcp.name).to.equal("firebase_login");
  }).timeout(2000);

  it("should return core tools by default", async () => {
    const tools = await availableTools(mockContext, [], []);
    // an example of a core tool
    const loginTool = tools.find((t) => t.mcp.name === "firebase_login");

    expect(loginTool).to.exist;
  }).timeout(2000);

  it("should include feature-specific tools when activeFeatures is provided", async () => {
    const tools = await availableTools(mockContext, ["firestore"]);
    const firestoreTool = tools.find((t) => t.mcp.name.startsWith("firestore_"));

    expect(firestoreTool).to.exist;
  }).timeout(2000);

  it("should not include feature tools if no active features", async () => {
    const tools = await availableTools(mockContext, ["core"]);
    const firestoreTool = tools.find((t) => t.mcp.name.startsWith("firestore_"));

    expect(firestoreTool).to.not.exist;
  }).timeout(2000);

  it("should fallback to detected features if activeFeatures is empty", async () => {
    const tools = await availableTools(mockContext, [], ["firestore"]);
    const firestoreTool = tools.find((t) => t.mcp.name.startsWith("firestore_"));

    expect(firestoreTool).to.exist;
  });
});

describe("getRemoteToolsByFeature", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should call fetchRemoteTools on servers in ONEMCP_SERVERS", async () => {
    const mockTool = { mcp: { name: "remote_tool" } };
    const fetchStub = sandbox
      .stub(OneMcpServer.prototype, "fetchRemoteTools")
      .resolves([mockTool as any]);

    const tools = await getRemoteToolsByFeature(["developerknowledge"]);

    expect(fetchStub).to.have.been.calledOnce;
    expect(tools).to.have.length(1);
    expect(tools[0].mcp.name).to.equal("remote_tool");
  });

  it("should filter by provided features", async () => {
    const fetchStub = sandbox.stub(OneMcpServer.prototype, "fetchRemoteTools").resolves([]);

    await getRemoteToolsByFeature(["developerknowledge"]);
    // Since only 'developerknowledge' is in ONEMCP_SERVERS currently,
    // we check that it was called once for that feature.
    expect(fetchStub).to.have.been.calledOnce;

    fetchStub.resetHistory();
    await getRemoteToolsByFeature([]);
    // If features is empty, it should use all keys in ONEMCP_SERVERS.
    expect(fetchStub).to.have.been.calledOnce;
  });

  it("should return flattened results from all remote servers", async () => {
    const mockTool1 = { mcp: { name: "developerknowledge_tool1" } };
    const mockTool2 = { mcp: { name: "firestore_tool1" } };
    const mockTool3 = { mcp: { name: "firestore_tool2" } };

    // Fake ONEMCP_SERVERS with multiple entries to test flattening
    const originalServers = { ...ONEMCP_SERVERS };
    (ONEMCP_SERVERS as any).developerknowledge = new OneMcpServer("developerknowledge", "url1");
    (ONEMCP_SERVERS as any).firestore = new OneMcpServer("firestore", "url2");

    const fetchStub = sandbox.stub(OneMcpServer.prototype, "fetchRemoteTools");
    fetchStub.onFirstCall().resolves([mockTool1 as any]);
    fetchStub.onSecondCall().resolves([mockTool2 as any, mockTool3 as any]);

    try {
      const tools = await getRemoteToolsByFeature(["developerknowledge", "firestore"]);
      expect(tools).to.have.length(3);
      expect(tools.map((t) => t.mcp.name)).to.include("developerknowledge_tool1");
      expect(tools.map((t) => t.mcp.name)).to.include("firestore_tool1");
      expect(tools.map((t) => t.mcp.name)).to.include("firestore_tool2");
    } finally {
      // Restore original ONEMCP_SERVERS
      for (const key of Object.keys(ONEMCP_SERVERS)) {
        if (!(key in originalServers)) {
          delete (ONEMCP_SERVERS as any)[key];
        }
      }
    }
  });
});
