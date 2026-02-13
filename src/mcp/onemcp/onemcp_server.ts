import { CallToolResult, CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "../../apiv2";
import { ServerTool } from "../tool";
import { McpContext, ServerFeature } from "../types";
import { FirebaseError } from "../../error";

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
    try {
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
            requiresAuth: true,
            requiresProject: true,
          },
        },
        fn: (args: any, ctx: McpContext) => this.proxyRemoteToolCall(mcpTool.name, args, ctx),
        isAvailable: () => Promise.resolve(true),
      }));
    } catch (error) {
      throw new FirebaseError("Failed to fetch remote tools for " + this.serverUrl + ": " + JSON.stringify(error));
    }
  }

  /**
   * Proxies a tool call to the remote MCP server.
   */
  private async proxyRemoteToolCall(toolName: string, args: any, ctx: McpContext): Promise<CallToolResult> {
    try {
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
      return CallToolResultSchema.parse(res.body.result);
    } catch (error) {
      if (error instanceof FirebaseError) {
        const firebaseError = error as FirebaseError;
        const body = (firebaseError.context as any)?.body;
        if (body?.result?.isError) {
          return CallToolResultSchema.parse(body.result);
        }
      }
      throw error;
    }
  }
}
