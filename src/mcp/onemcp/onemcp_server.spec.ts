import { expect } from "chai";
import * as sinon from "sinon";
import { OneMcpServer } from "./onemcp_server";
import { Client } from "../../apiv2";
import * as ensureModule from "../../ensureApiEnabled";
import { FirebaseError } from "../../error";
import { ServerFeature } from "../types";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

describe("OneMcpServer", () => {
  let sandbox: sinon.SinonSandbox;
  let clientRequestStub: sinon.SinonStub;
  let ensureStub: sinon.SinonStub;

  const feature = "auth" as ServerFeature;
  const serverUrl = "https://example.com";
  let server: OneMcpServer;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clientRequestStub = sandbox.stub(Client.prototype, "request");
    ensureStub = sandbox.stub(ensureModule, "ensure").resolves();
    server = new OneMcpServer(feature, serverUrl, { requiresAuth: false });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("listTools", () => {
    it("should fetch and parse remote tools successfully", async () => {
      const mockMcpTool = {
        name: "test_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: { status: { type: "string" } } },
      };
      clientRequestStub.resolves({
        body: {
          result: {
            tools: [mockMcpTool],
          },
        },
      });

      const tools = await server.listTools();

      expect(tools).to.have.length(1);
      expect(tools[0].mcp.name).to.equal("auth_test_tool");
      expect(tools[0].mcp.description).to.equal(mockMcpTool.description);
      expect(tools[0].mcp.outputSchema).to.deep.equal(mockMcpTool.outputSchema);
      expect(tools[0].mcp._meta).to.deep.equal({
        requiresAuth: false,
        requiresProject: true,
        feature: "auth",
      });
      expect(clientRequestStub).to.have.been.calledOnce;
      expect(clientRequestStub.firstCall.args[0].headers).to.deep.include({
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Method": "tools/list",
      });
    });

    it("should throw FirebaseError if fetch fails", async () => {
      clientRequestStub.rejects(new Error("Network Error"));

      await expect(server.listTools()).to.be.rejectedWith(
        FirebaseError,
        /Failed to fetch remote tools/,
      );
    });

    it("should throw error if fetch returns invalid schema", async () => {
      clientRequestStub.resolves({
        body: {
          invalid: "schema",
        },
      });

      await expect(server.listTools()).to.be.rejected;
    });

    it("should filter tools if allowedTools option is provided", async () => {
      const serverWithFilter = new OneMcpServer(
        feature,
        serverUrl,
        { requiresAuth: false, requiresProject: true },
        { allowedTools: ["allowed_tool"] },
      );
      clientRequestStub.resolves({
        body: {
          result: {
            tools: [
              { name: "allowed_tool", inputSchema: { type: "object" } },
              { name: "disallowed_tool", inputSchema: { type: "object" } },
            ],
          },
        },
      });

      const tools = await serverWithFilter.listTools();

      expect(tools).to.have.length(1);
      expect(tools[0].mcp.name).to.equal("auth_allowed_tool");
    });

    it("should set requiresProject to false if requiresProject is false in meta", async () => {
      const serverWithoutProject = new OneMcpServer(feature, serverUrl, {
        requiresAuth: false,
        requiresProject: false,
      });
      clientRequestStub.resolves({
        body: {
          result: {
            tools: [{ name: "test_tool", inputSchema: { type: "object" } }],
          },
        },
      });

      const tools = await serverWithoutProject.listTools();

      expect(tools[0].mcp._meta?.requiresProject).to.be.false;
    });

    it("should set requiresProject to false for tools in toolsToOptOutProjectRequirement", async () => {
      const serverWithOptOut = new OneMcpServer(
        feature,
        serverUrl,
        { requiresAuth: false },
        { toolsToOptOutProjectRequirement: ["opted_out_tool"] },
      );
      clientRequestStub.resolves({
        body: {
          result: {
            tools: [
              { name: "opted_out_tool", inputSchema: { type: "object" } },
              { name: "normal_tool", inputSchema: { type: "object" } },
            ],
          },
        },
      });

      const tools = await serverWithOptOut.listTools();

      const optedOutTool = tools.find((t) => t.mcp.name === "auth_opted_out_tool");
      const normalTool = tools.find((t) => t.mcp.name === "auth_normal_tool");

      expect(optedOutTool).to.not.be.undefined;
      expect(normalTool).to.not.be.undefined;
      expect(optedOutTool!.mcp._meta?.requiresProject).to.be.false;
      expect(normalTool!.mcp._meta?.requiresProject).to.be.true;
    });
  });

  describe("callTool", () => {
    const mockContext: any = {
      projectId: "test-project",
    };

    it("should call ensure and proxy tool call successfully", async () => {
      const mockMcpTool = { name: "test_tool", inputSchema: { type: "object", properties: {} } };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.listTools();
      const tool = tools[0];

      const mockCallResult = { content: [{ type: "text", text: "success" }] };
      clientRequestStub.onSecondCall().resolves({
        body: { result: mockCallResult },
      });

      const result = await tool.fn({ arg: "val" }, mockContext);

      expect(result).to.deep.equal(mockCallResult);
      expect(ensureStub).to.have.been.calledOnceWith(
        mockContext.projectId,
        serverUrl,
        feature,
        true,
      );
      expect(clientRequestStub.secondCall.args[0]).to.deep.include({
        method: "POST",
        body: {
          method: "tools/call",
          params: {
            name: "test_tool",
            arguments: { arg: "val" },
          },
          jsonrpc: "2.0",
          id: 1,
        },
      });
      expect(clientRequestStub.secondCall.args[0].headers).to.deep.include({
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "test_tool",
        "x-goog-user-project": "test-project",
      });
    });

    it("should include Mcp-Param-X HTTP headers when tool inputSchema defines x-mcp-header", async () => {
      const mockMcpTool = {
        name: "execute_sql",
        inputSchema: {
          type: "object",
          properties: {
            region: {
              type: "string",
              "x-mcp-header": "Region",
            },
            query: {
              type: "string",
            },
          },
        },
      };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.listTools();
      const tool = tools[0];

      clientRequestStub.onSecondCall().resolves({
        body: { result: { content: [] } },
      });

      await tool.fn({ region: "us-west1", query: "SELECT 1" }, mockContext);

      expect(clientRequestStub.secondCall.args[0].headers).to.deep.include({
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "execute_sql",
        "x-goog-user-project": "test-project",
        "Mcp-Param-Region": "us-west1",
      });
    });

    it("should proxy tool call without x-goog-user-project header if projectId is missing", async () => {
      const mockMcpTool = { name: "test_tool", inputSchema: { type: "object", properties: {} } };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.listTools();
      const tool = tools[0];

      clientRequestStub.onSecondCall().resolves({
        body: { result: { content: [] } },
      });

      await tool.fn({ arg: "val" }, { ...mockContext, projectId: undefined });

      expect(clientRequestStub.secondCall.args[0].headers?.["x-goog-user-project"]).to.be.undefined;
      expect(clientRequestStub.secondCall.args[0].headers).to.deep.equal({
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "test_tool",
      });
      expect(ensureStub).to.not.have.been.called;
    });

    it("should call ensure and include project header when projectId is present, even if tool is opted out of project requirement", async () => {
      const serverWithOptOut = new OneMcpServer(
        feature,
        serverUrl,
        { requiresAuth: false },
        { toolsToOptOutProjectRequirement: ["opted_out_tool"] },
      );
      const mockMcpTool = {
        name: "opted_out_tool",
        inputSchema: { type: "object", properties: {} },
      };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await serverWithOptOut.listTools();
      const tool = tools[0];

      clientRequestStub.onSecondCall().resolves({
        body: { result: { content: [] } },
      });

      await tool.fn({ arg: "val" }, mockContext);

      expect(ensureStub).to.have.been.calledOnceWith(
        mockContext.projectId,
        serverUrl,
        feature,
        true,
      );
      expect(clientRequestStub.secondCall.args[0].headers).to.deep.include({
        "x-goog-user-project": "test-project",
      });
    });

    it("should handle remote tool error results", async () => {
      const mockMcpTool = { name: "test_tool", inputSchema: { type: "object", properties: {} } };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.listTools();
      const tool = tools[0];

      const mockErrorResult = { isError: true, content: [{ type: "text", text: "remote error" }] };
      const firebaseError = new FirebaseError("Remote tool error", {
        status: 400,
        context: {
          body: {
            result: mockErrorResult,
          },
        },
      });
      clientRequestStub.onSecondCall().rejects(firebaseError);

      const result = await tool.fn({ arg: "val" }, mockContext);

      expect(result).to.deep.equal(mockErrorResult);
    });

    it("should throw original error if not a handled FirebaseError", async () => {
      const mockMcpTool = { name: "test_tool", inputSchema: { type: "object", properties: {} } };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.listTools();
      const tool = tools[0];

      const genericError = new Error("Generic Error");
      clientRequestStub.onSecondCall().rejects(genericError);

      await expect(tool.fn({}, mockContext)).to.be.rejectedWith("Generic Error");
    });

    it("should throw error if proxy call returns invalid schema", async () => {
      const mockMcpTool = { name: "test_tool", inputSchema: { type: "object", properties: {} } };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.listTools();
      const tool = tools[0];

      clientRequestStub.onSecondCall().resolves({
        body: { invalid: "schema" },
      });

      await expect(tool.fn({}, mockContext)).to.be.rejected;
    });

    it("should throw FirebaseError when calling a tool not in allowedTools", async () => {
      const serverWithFilter = new OneMcpServer(
        feature,
        serverUrl,
        { requiresAuth: false, requiresProject: true },
        { allowedTools: ["allowed_tool"] },
      );

      const fn = (serverWithFilter as any).callTool.bind(serverWithFilter);

      await expect(fn("disallowed_tool", undefined, {}, mockContext)).to.be.rejectedWith(
        FirebaseError,
        /is not allowed on remote server/,
      );
    });
  });
});
