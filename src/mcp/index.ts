import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpError } from "./util.js";
import { ServerFeature } from "./types.js";
import { availableTools } from "./tools/index.js";
import { ServerTool } from "./tool.js";
import { configstore } from "../configstore.js";
import { Command } from "../command.js";
import { requireAuth } from "../requireAuth.js";
import { Options } from "../options.js";
import { getProjectId } from "../projectUtils.js";
import { mcpAuthError, NO_PROJECT_ERROR } from "./errors.js";
import { trackGA4 } from "../track.js";
import { Config } from "../config.js";

const SERVER_VERSION = "0.0.1";
const PROJECT_ROOT_KEY = "mcp.projectRoot";

const cmd = new Command("experimental:mcp").before(requireAuth);

export class FirebaseMcpServer {
  projectRoot?: string;
  server: Server;
  activeFeatures?: ServerFeature[];
  fixedRoot?: boolean;

  constructor(options: { activeFeatures?: ServerFeature[]; projectRoot?: string }) {
    this.activeFeatures = options.activeFeatures;
    this.server = new Server({ name: "firebase", version: SERVER_VERSION });
    this.server.registerCapabilities({ tools: { listChanged: true } });
    this.server.setRequestHandler(ListToolsRequestSchema, this.mcpListTools.bind(this));
    this.server.setRequestHandler(CallToolRequestSchema, this.mcpCallTool.bind(this));
    this.projectRoot =
      options.projectRoot ??
      (configstore.get(PROJECT_ROOT_KEY) as string) ??
      process.env.PROJECT_ROOT ??
      process.cwd();
    if (options.projectRoot) this.fixedRoot = true;
  }

  get availableTools(): ServerTool[] {
    return availableTools(!!this.fixedRoot, this.activeFeatures);
  }

  getTool(name: string): ServerTool | null {
    return this.availableTools.find((t) => t.mcp.name === name) || null;
  }

  async mcpListTools(): Promise<ListToolsResult> {
    const hasActiveProject = !!(await this.getProjectId());
    await trackGA4("mcp_list_tools", {});
    return {
      tools: this.availableTools.map((t) => t.mcp),
      _meta: {
        projectRoot: this.projectRoot,
        projectDetected: hasActiveProject,
        authenticated: await this.getAuthenticated(),
        activeFeatures: this.activeFeatures,
      },
    };
  }

  setProjectRoot(newRoot: string | null): void {
    if (newRoot === null) {
      configstore.delete(PROJECT_ROOT_KEY);
      this.projectRoot = process.env.PROJECT_ROOT || process.cwd();
      void this.server.sendToolListChanged();
      return;
    }

    configstore.set(PROJECT_ROOT_KEY, newRoot);
    this.projectRoot = newRoot;
    void this.server.sendToolListChanged();
  }

  async resolveOptions(): Promise<Partial<Options>> {
    const options: Partial<Options> = { cwd: this.projectRoot };
    await cmd.prepare(options);
    return options;
  }

  async getProjectId(): Promise<string | undefined> {
    return getProjectId(await this.resolveOptions());
  }

  async getAuthenticated(): Promise<boolean> {
    try {
      await requireAuth(await this.resolveOptions());
      return true;
    } catch (e) {
      return false;
    }
  }

  async mcpCallTool(request: CallToolRequest): Promise<CallToolResult> {
    const toolName = request.params.name;
    const toolArgs = request.params.arguments;
    const tool = this.getTool(toolName);
    if (!tool) throw new Error(`Tool '${toolName}' could not be found.`);

    const projectId = await this.getProjectId();
    if (tool.mcp._meta?.requiresAuth && !(await this.getAuthenticated())) return mcpAuthError();
    if (tool.mcp._meta?.requiresProject && !projectId) return NO_PROJECT_ERROR;

    try {
      const config = Config.load({ cwd: this.projectRoot });
      const res = await tool.fn(toolArgs, {
        projectId: await this.getProjectId(),
        host: this,
        config,
      });
      await trackGA4("mcp_tool_call", { tool_name: toolName, error: res.isError ? 1 : 0 });
      return res;
    } catch (err: unknown) {
      await trackGA4("mcp_tool_call", { tool_name: toolName, error: 1 });
      return mcpError(err);
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
