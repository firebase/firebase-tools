import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { ServerFeature } from "./types.js";
import { tools } from "./tools/index.js";
import { ServerTool } from "./tool.js";

const SERVER_VERSION = "0.0.1";

export class FirebaseMcpServer {
  projectId?: string;
  server: Server;
  cliOptions: any;
  activeFeatures?: ServerFeature[];

  constructor(options: { activeFeatures?: ServerFeature[]; cliOptions: any }) {
    this.activeFeatures = options.activeFeatures;
    this.cliOptions = options.cliOptions;
    this.server = new Server({ name: "firebase", version: SERVER_VERSION });
    this.server.registerCapabilities({ tools: { listChanged: false } });
    this.server.setRequestHandler(ListToolsRequestSchema, this.mcpListTools.bind(this));
    this.server.setRequestHandler(CallToolRequestSchema, this.mcpCallTool.bind(this));
  }

  get activeTools(): ServerTool[] {
    const toolDefs: ServerTool[] = [];
    const activeFeatures = this.activeFeatures || (Object.keys(tools) as ServerFeature[]);
    for (const key of activeFeatures || []) {
      toolDefs.push(...tools[key]);
    }
    return toolDefs;
  }

  getTool(name: string): ServerTool | null {
    return this.activeTools.find((t) => t.mcp.name === name) || null;
  }

  mcpListTools(): Promise<ListToolsResult> {
    return Promise.resolve({
      tools: this.activeTools.map((t) => t.mcp),
      _meta: {
        activeFeatures: this.activeFeatures,
      },
    });
  }

  async mcpCallTool(request: CallToolRequest): Promise<CallToolResult> {
    const toolName = request.params.name;
    const toolArgs = request.params.arguments;
    const tool = this.getTool(toolName);
    if (!tool) throw new Error(`Tool '${toolName}' could not be found.`);
    return tool.fn(toolArgs, { projectId: this.cliOptions.project });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
