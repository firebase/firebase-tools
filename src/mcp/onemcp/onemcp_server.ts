import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "../../apiv2";
import { ServerTool } from "../tool";
import { McpContext, ServerFeature } from "../types";

/**
 * OneMcpServer encapsulates the logic for interacting with a remote MCP server.
 */
export class OneMcpServer {
  private listClient: Client;
  private callClient: Client;
  constructor(
    private readonly feature: ServerFeature,
    private readonly serverUrl: string,
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
  async fetchRemoteTools(): Promise<ServerTool[]> {
    const res = await this.listClient.post<any, any>("/mcp", {
      method: "tools/list",
      jsonrpc: "2.0",
      id: 1,
    });

    const parsed = ListToolsResultSchema.parse(res.body.result);
    return (parsed.tools as any[]).map((mcpTool) => ({
      mcp: {
        ...mcpTool,
        name: `${this.feature}_${mcpTool.name}`,
        _meta: {
          ...(mcpTool._meta || {}),
          feature: this.feature,
        },
      },
      fn: (args: any, ctx: McpContext) => this.proxyRemoteToolCall(mcpTool.name, args, ctx),
      isAvailable: () => Promise.resolve(true),
    }));
  }

  /**
   * Proxies a tool call to the remote MCP server.
   */
  private async proxyRemoteToolCall(toolName: string, args: any, ctx: McpContext): Promise<any> {
    const res = await this.callClient.post<any, any>(
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
      ctx.projectId
        ? {
          headers: {
            "x-goog-user-project": ctx.projectId,
          },
        }
        : {},
    );
    if (res.body.error) {
      throw new Error(
        `Remote MCP error: ${res.body.error.message || JSON.stringify(res.body.error)}`,
      );
    }
    return CallToolResultSchema.parse(res.body.result);
  }
}
