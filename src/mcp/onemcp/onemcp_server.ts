import {
  CallToolResult,
  CallToolResultSchema,
  ListToolsResultSchema,
  JSONRPCResultResponse,
  JSONRPCRequest,
  ListToolsRequest,
  CallToolRequest,
  LATEST_PROTOCOL_VERSION,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "../../apiv2";
import { ServerTool, ServerToolMeta } from "../tool";
import { McpContext, ServerFeature } from "../types";
import { FirebaseError } from "../../error";
import { ensure } from "../../ensureApiEnabled";

export interface OneMcpServerOptions {
  /**
   * Optional allowlist of tool names. If provided, only tools matching
   * these names (original remote tool name or prefixed name) will be surfaced in listTools()
   * and permitted in callTool().
   */
  allowedTools?: string[];
}

/**
 * OneMcpServer encapsulates the logic for interacting with a remote MCP server.
 */
export class OneMcpServer {
  private listClient: Client;
  private callClient: Client;
  /**
   * @param feature The Firebase feature this server belongs to.
   * @param serverUrl The base URL of the remote MCP server.
   * @param meta Metadata to be attached to every tool from this server.
   * @param options Additional options, including tool filtering.
   */
  constructor(
    private readonly feature: ServerFeature,
    private readonly serverUrl: string,
    private readonly meta: ServerToolMeta,
    private readonly options: OneMcpServerOptions = {},
  ) {
    this.listClient = new Client({
      urlPrefix: this.serverUrl,
      auth: false,
    });
    this.callClient = new Client({
      urlPrefix: this.serverUrl,
      auth: true,
    });
  }

  /**
   * Fetches tools from the remote MCP server.
   */
  async listTools(): Promise<ServerTool[]> {
    try {
      const res = await this.listClient.post<
        JSONRPCRequest & ListToolsRequest,
        JSONRPCResultResponse
      >(
        "/mcp",
        {
          method: "tools/list",
          jsonrpc: "2.0",
          id: 1,
        },
        {
          headers: {
            "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
            "Mcp-Method": "tools/list",
          },
        },
      );

      const parsed = ListToolsResultSchema.parse(res.body.result);
      const tools = parsed.tools.filter((mcpTool) => {
        if (!this.options.allowedTools?.length) {
          return true;
        }
        return (
          this.options.allowedTools.includes(mcpTool.name) ||
          this.options.allowedTools.includes(`${this.feature}_${mcpTool.name}`)
        );
      });

      return tools.map((mcpTool) => ({
        mcp: {
          ...mcpTool,
          name: `${this.feature}_${mcpTool.name}`,
          _meta: { ...this.meta, feature: this.feature },
        },
        fn: (
          args: {
            [x: string]: unknown;
          },
          ctx: McpContext,
        ) => this.callTool(mcpTool.name, args, ctx),
        isAvailable: () => Promise.resolve(true),
      }));
    } catch (error) {
      throw new FirebaseError(
        "Failed to fetch remote tools for " + this.serverUrl + ": " + JSON.stringify(error),
      );
    }
  }

  /**
   * Proxies a tool call to the remote MCP server.
   */
  private async callTool(
    toolName: string,
    args: {
      [x: string]: unknown;
    },
    ctx: McpContext,
  ): Promise<CallToolResult> {
    if (
      this.options.allowedTools?.length &&
      !this.options.allowedTools.includes(toolName) &&
      !this.options.allowedTools.includes(`${this.feature}_${toolName}`)
    ) {
      throw new FirebaseError(
        `Tool '${toolName}' is not allowed on remote server for feature '${this.feature}'.`,
      );
    }

    // TODO: Optimize this to not call ensure on every tool call.
    await ensure(ctx.projectId, this.serverUrl, this.feature, /* silent=*/ true);
    try {
      const res = await this.callClient.post<
        JSONRPCRequest & CallToolRequest,
        JSONRPCResultResponse
      >(
        "/mcp",
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments: args,
          },
          jsonrpc: "2.0",
          id: 1,
        },
        {
          headers: {
            "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
            "Mcp-Method": "tools/call",
            "Mcp-Name": toolName,
            ...(ctx.projectId ? { "x-goog-user-project": ctx.projectId } : {}),
          },
        },
      );
      return CallToolResultSchema.parse(res.body.result);
    } catch (error) {
      if (error instanceof FirebaseError) {
        const firebaseError = error;
        const body = (firebaseError.context as any)?.body;
        if (body?.result?.isError) {
          return CallToolResultSchema.parse(body.result);
        }
      }
      throw error;
    }
  }
}
