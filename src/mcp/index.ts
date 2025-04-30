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
import { tools } from "./tools/index.js";
import { ServerTool } from "./tool.js";
import { configstore } from "../configstore.js";
import { coreTools } from "./tools/core/index.js";
import { Command } from "../command.js";
import { requireAuth } from "../requireAuth.js";
import { Options } from "../options.js";
import { getProjectId } from "../projectUtils.js";
import { mcpAuthError, NO_PROJECT_ERROR } from "./errors.js";

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
    const toolDefs: ServerTool[] = this.fixedRoot ? [] : [...coreTools];
    const activeFeatures = this.activeFeatures?.length
      ? this.activeFeatures
      : (Object.keys(tools) as ServerFeature[]);
    for (const key of activeFeatures || []) {
      toolDefs.push(...tools[key]);
    }
    return toolDefs;
  }

  getTool(name: string): ServerTool | null {
    return this.availableTools.find((t) => t.mcp.name === name) || null;
  }

  async mcpListTools(): Promise<ListToolsResult> {
    const hasActiveProject = !!(await this.getProjectId());
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
      return tool.fn(toolArgs, { projectId: await this.getProjectId(), host: this });
    } catch (err: unknown) {
      return mcpError(err);
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
