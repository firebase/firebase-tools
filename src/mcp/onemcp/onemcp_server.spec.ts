import { expect } from "chai";
import * as sinon from "sinon";
import { OneMcpServer } from "./onemcp_server";
import { Client } from "../../apiv2";
import * as ensureModule from "../../ensureApiEnabled";
import { FirebaseError } from "../../error";

describe("OneMcpServer", () => {
  let sandbox: sinon.SinonSandbox;
  let clientRequestStub: sinon.SinonStub;
  let ensureStub: sinon.SinonStub;

  const feature = "test_feature" as any;
  const serverUrl = "https://example.com";
  let server: OneMcpServer;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clientRequestStub = sandbox.stub(Client.prototype, "request");
    ensureStub = sandbox.stub(ensureModule, "ensure").resolves();
    server = new OneMcpServer(feature, serverUrl);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("fetchRemoteTools", () => {
    it("should fetch and parse remote tools successfully", async () => {
      const mockMcpTool = {
        name: "test_tool",
        description: "A test tool",
        inputSchema: { type: "object", properties: {} },
      };
      clientRequestStub.resolves({
        body: {
          result: {
            tools: [mockMcpTool],
          },
        },
      });

      const tools = await server.fetchRemoteTools();

      expect(tools).to.have.length(1);
      expect(tools[0].mcp.name).to.equal("test_feature_test_tool");
      expect(tools[0].mcp.description).to.equal(mockMcpTool.description);
      expect(tools[0].mcp._meta).to.deep.equal({
        requiresAuth: true,
        requiresProject: true,
      });
      expect(clientRequestStub).to.have.been.calledOnce;
    });

    it("should throw FirebaseError if fetch fails", async () => {
      clientRequestStub.rejects(new Error("Network Error"));

      await expect(server.fetchRemoteTools()).to.be.rejectedWith(
        FirebaseError,
        /Failed to fetch remote tools/,
      );
    });
  });

  describe("proxyRemoteToolCall", () => {
    const mockContext: any = {
      projectId: "test-project",
    };

    it("should call ensure and proxy tool call successfully", async () => {
      const mockMcpTool = { name: "test_tool", inputSchema: { type: "object", properties: {} } };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.fetchRemoteTools();
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
        "x-goog-user-project": "test-project",
      });
    });

    it("should handle remote tool error results", async () => {
      const mockMcpTool = { name: "test_tool", inputSchema: { type: "object", properties: {} } };
      clientRequestStub.onFirstCall().resolves({
        body: { result: { tools: [mockMcpTool] } },
      });

      const tools = await server.fetchRemoteTools();
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

      const tools = await server.fetchRemoteTools();
      const tool = tools[0];

      const genericError = new Error("Generic Error");
      clientRequestStub.onSecondCall().rejects(genericError);

      await expect(tool.fn({}, mockContext)).to.be.rejectedWith("Generic Error");
    });
  });
});
