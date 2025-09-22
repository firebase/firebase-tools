import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsResult,
  LoggingLevel,
  SetLevelRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsResult,
  GetPromptResult,
  GetPromptRequest,
  ListResourcesRequestSchema,
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
  McpError,
  ErrorCode,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { checkFeatureActive, mcpError } from "./util";
import { ClientConfig, McpContext, SERVER_FEATURES, ServerFeature } from "./types";
import { availableTools } from "./tools/index";
import { ServerTool } from "./tool";
import { availablePrompts } from "./prompts/index";
import { ServerPrompt } from "./prompt";
import { configstore } from "../configstore";
import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { Options } from "../options";
import { getProjectId } from "../projectUtils";
import { mcpAuthError, noProjectDirectory, NO_PROJECT_ERROR, requireGeminiToS } from "./errors";
import { trackGA4 } from "../track";
import { Config } from "../config";
import { loadRC } from "../rc";
import { EmulatorHubClient } from "../emulator/hubClient";
import { Emulators } from "../emulator/types";
import { existsSync } from "node:fs";
import { LoggingStdioServerTransport } from "./logging-transport";
import { isFirebaseStudio } from "../env";
import { timeoutFallback } from "../timeout";
import { resources } from "./resources";

const SERVER_VERSION = "0.3.0";

const cmd = new Command("experimental:mcp");

const orderedLogLevels = [
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency",
] as const;

export class FirebaseMcpServer {
  private _ready: boolean = false;
  private _readyPromises: { resolve: () => void; reject: (err: unknown) => void }[] = [];
  startupRoot?: string;
  cachedProjectDir?: string;
  server: Server;
  activeFeatures?: ServerFeature[];
  detectedFeatures?: ServerFeature[];
  clientInfo?: { name?: string; version?: string };
  emulatorHubClient?: EmulatorHubClient;

  // logging spec:
  // https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/logging
  currentLogLevel?: LoggingLevel = process.env.FIREBASE_MCP_DEBUG_LOG ? "debug" : undefined;
  // the api of logging from a consumers perspective looks like `server.logger.warn("my warning")`.
  public readonly logger = Object.fromEntries(
    orderedLogLevels.map((logLevel) => [
      logLevel,
      (message: unknown) => this.log(logLevel, message),
    ]),
  ) as Record<LoggingLevel, (message: unknown) => Promise<void>>;

  /** Create a special tracking function to avoid blocking everything on initialization notification. */
  private async trackGA4(
    event: Parameters<typeof trackGA4>[0],
    params: Parameters<typeof trackGA4>[1] = {},
  ): Promise<void> {
    // wait until ready or until 2s has elapsed
    if (!this.clientInfo) await timeoutFallback(this.ready(), null, 2000);
    const clientInfoParams = {
      mcp_client_name: this.clientInfo?.name || "<unknown-client>",
      mcp_client_version: this.clientInfo?.version || "<unknown-version>",
    };
    trackGA4(event, { ...params, ...clientInfoParams });
  }

  constructor(options: { activeFeatures?: ServerFeature[]; projectRoot?: string }) {
    this.activeFeatures = options.activeFeatures;
    this.startupRoot = options.projectRoot || process.env.PROJECT_ROOT;
    this.server = new Server({ name: "firebase", version: SERVER_VERSION });
    this.server.registerCapabilities({
      tools: { listChanged: true },
      logging: {},
      prompts: { listChanged: true },
      resources: {},
    });

    this.server.setRequestHandler(ListToolsRequestSchema, this.mcpListTools.bind(this));
    this.server.setRequestHandler(CallToolRequestSchema, this.mcpCallTool.bind(this));
    this.server.setRequestHandler(ListPromptsRequestSchema, this.mcpListPrompts.bind(this));
    this.server.setRequestHandler(GetPromptRequestSchema, this.mcpGetPrompt.bind(this));
    this.server.setRequestHandler(ListResourcesRequestSchema, this.mcpListResources.bind(this));
    this.server.setRequestHandler(ReadResourceRequestSchema, this.mcpReadResource.bind(this));

    this.server.oninitialized = async () => {
      const clientInfo = this.server.getClientVersion();
      this.clientInfo = clientInfo;
      if (clientInfo?.name) {
        this.trackGA4("mcp_client_connected");
      }
      if (!this.clientInfo?.name) this.clientInfo = { name: "<unknown-client>" };

      this._ready = true;
      while (this._readyPromises.length) {
        this._readyPromises.pop()?.resolve();
      }
    };

    this.server.setRequestHandler(SetLevelRequestSchema, async ({ params }) => {
      this.currentLogLevel = params.level;
      return {};
    });

    this.detectProjectRoot();
    this.detectActiveFeatures();
  }

  /** Wait until initialization has finished. */
  ready() {
    if (this._ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this._readyPromises.push({ resolve: resolve as () => void, reject });
    });
  }

  get clientName(): string {
    return this.clientInfo?.name ?? (isFirebaseStudio() ? "Firebase Studio" : "<unknown-client>");
  }

  private get clientConfigKey() {
    return `mcp.clientConfigs.${this.clientName}:${this.startupRoot || process.cwd()}`;
  }

  getStoredClientConfig(): ClientConfig {
    return configstore.get(this.clientConfigKey) || {};
  }

  updateStoredClientConfig(update: Partial<ClientConfig>) {
    const config = configstore.get(this.clientConfigKey) || {};
    const newConfig = { ...config, ...update };
    configstore.set(this.clientConfigKey, newConfig);
    return newConfig;
  }

  async detectProjectRoot(): Promise<string> {
    await timeoutFallback(this.ready(), null, 2000);
    if (this.cachedProjectDir) return this.cachedProjectDir;
    const storedRoot = this.getStoredClientConfig().projectRoot;
    this.cachedProjectDir = storedRoot || this.startupRoot || process.cwd();
    this.log("debug", "detected and cached project root: " + this.cachedProjectDir);
    return this.cachedProjectDir;
  }

  async detectActiveFeatures(): Promise<ServerFeature[]> {
    if (this.detectedFeatures?.length) return this.detectedFeatures; // memoized
    this.log("debug", "detecting active features of Firebase MCP server...");
    const options = await this.resolveOptions();
    const projectId = await this.getProjectId();
    const detected = await Promise.all(
      SERVER_FEATURES.map(async (f) => {
        if (await checkFeatureActive(f, projectId, options)) return f;
        return null;
      }),
    );
    this.detectedFeatures = detected.filter((f) => !!f) as ServerFeature[];
    this.log(
      "debug",
      "detected features of Firebase MCP server: " + (this.detectedFeatures.join(", ") || "<none>"),
    );
    return this.detectedFeatures;
  }

  async getEmulatorHubClient(): Promise<EmulatorHubClient | undefined> {
    // Single initialization
    if (this.emulatorHubClient) {
      return this.emulatorHubClient;
    }
    const projectId = await this.getProjectId();
    this.emulatorHubClient = new EmulatorHubClient(projectId);
    return this.emulatorHubClient;
  }

  async getEmulatorUrl(emulatorType: Emulators): Promise<string> {
    const hubClient = await this.getEmulatorHubClient();
    if (!hubClient) {
      throw Error(
        "Emulator Hub not found or is not running. You can start the emulator by running `firebase emulators:start` in your firebase project directory.",
      );
    }

    const emulators = await hubClient.getEmulators();
    const emulatorInfo = emulators[emulatorType];
    if (!emulatorInfo) {
      throw Error(
        `No ${emulatorType} Emulator found running. Make sure your project firebase.json file includes ${emulatorType} and then rerun emulator using \`firebase emulators:start\` from your project directory.`,
      );
    }

    const host = emulatorInfo.host.includes(":") ? `[${emulatorInfo.host}]` : emulatorInfo.host;

    return `http://${host}:${emulatorInfo.port}`;
  }

  get availableTools(): ServerTool[] {
    return availableTools(
      this.activeFeatures?.length ? this.activeFeatures : this.detectedFeatures,
    );
  }

  getTool(name: string): ServerTool | null {
    return this.availableTools.find((t) => t.mcp.name === name) || null;
  }

  get availablePrompts(): ServerPrompt[] {
    return availablePrompts(
      this.activeFeatures?.length ? this.activeFeatures : this.detectedFeatures,
    );
  }

  getPrompt(name: string): ServerPrompt | null {
    return this.availablePrompts.find((p) => p.mcp.name === name) || null;
  }

  setProjectRoot(newRoot: string | null): void {
    this.updateStoredClientConfig({ projectRoot: newRoot });
    this.cachedProjectDir = newRoot || undefined;
    this.detectedFeatures = undefined; // reset detected features
    void this.server.sendToolListChanged();
    void this.server.sendPromptListChanged();
  }

  async resolveOptions(): Promise<Partial<Options>> {
    const options: Partial<Options> = { cwd: this.cachedProjectDir, isMCP: true };
    await cmd.prepare(options);
    return options;
  }

  async getProjectId(): Promise<string | undefined> {
    return getProjectId(await this.resolveOptions());
  }

  async getAuthenticatedUser(skipAutoAuth: boolean = false): Promise<string | null> {
    try {
      this.log("debug", `calling requireAuth`);
      const email = await requireAuth(await this.resolveOptions(), skipAutoAuth);
      this.log("debug", `detected authenticated account: ${email || "<none>"}`);
      return email ?? (skipAutoAuth ? null : "Application Default Credentials");
    } catch (e) {
      this.log("debug", `error in requireAuth: ${e}`);
      return null;
    }
  }

  async mcpListTools(): Promise<ListToolsResult> {
    await Promise.all([this.detectActiveFeatures(), this.detectProjectRoot()]);
    const hasActiveProject = !!(await this.getProjectId());
    await this.trackGA4("mcp_list_tools");
    const skipAutoAuthForStudio = isFirebaseStudio();
    this.log("debug", `skip auto-auth in studio environment: ${skipAutoAuthForStudio}`);
    return {
      tools: this.availableTools.map((t) => t.mcp),
      _meta: {
        projectRoot: this.cachedProjectDir,
        projectDetected: hasActiveProject,
        authenticatedUser: await this.getAuthenticatedUser(skipAutoAuthForStudio),
        activeFeatures: this.activeFeatures,
        detectedFeatures: this.detectedFeatures,
      },
    };
  }

  async mcpCallTool(request: CallToolRequest): Promise<CallToolResult> {
    await this.detectProjectRoot();
    const toolName = request.params.name;
    const toolArgs = request.params.arguments;
    const tool = this.getTool(toolName);
    if (!tool) throw new Error(`Tool '${toolName}' could not be found.`);

    // Check if the current project directory exists.
    if (!tool.mcp._meta?.optionalProjectDir) {
      if (!this.cachedProjectDir || !existsSync(this.cachedProjectDir)) {
        return noProjectDirectory(this.cachedProjectDir);
      }
    }

    // Check if the project ID is set.
    let projectId = await this.getProjectId();
    if (tool.mcp._meta?.requiresProject && !projectId) {
      return NO_PROJECT_ERROR;
    }
    projectId = projectId || "";

    // Check if the user is logged in.
    const skipAutoAuthForStudio = isFirebaseStudio();
    const accountEmail = await this.getAuthenticatedUser(skipAutoAuthForStudio);
    if (tool.mcp._meta?.requiresAuth && !accountEmail) {
      return mcpAuthError(skipAutoAuthForStudio);
    }

    // Check if the tool requires Gemini in Firebase API.
    if (tool.mcp._meta?.requiresGemini) {
      const err = await requireGeminiToS(projectId);
      if (err) return err;
    }

    const options = { projectDir: this.cachedProjectDir, cwd: this.cachedProjectDir };
    const toolsCtx: McpContext = {
      projectId: projectId,
      host: this,
      config: Config.load(options, true) || new Config({}, options),
      rc: loadRC(options),
      accountEmail,
    };
    try {
      const res = await tool.fn(toolArgs, toolsCtx);
      await this.trackGA4("mcp_tool_call", {
        tool_name: toolName,
        error: res.isError ? 1 : 0,
      });
      return res;
    } catch (err: unknown) {
      await this.trackGA4("mcp_tool_call", {
        tool_name: toolName,
        error: 1,
      });
      return mcpError(err);
    }
  }

  async mcpListPrompts(): Promise<ListPromptsResult> {
    await Promise.all([this.detectActiveFeatures(), this.detectProjectRoot()]);
    const hasActiveProject = !!(await this.getProjectId());
    await this.trackGA4("mcp_list_prompts");
    const skipAutoAuthForStudio = isFirebaseStudio();
    return {
      prompts: this.availablePrompts.map((p) => ({
        name: p.mcp.name,
        description: p.mcp.description,
        annotations: p.mcp.annotations,
        arguments: p.mcp.arguments,
      })),
      _meta: {
        projectRoot: this.cachedProjectDir,
        projectDetected: hasActiveProject,
        authenticatedUser: await this.getAuthenticatedUser(skipAutoAuthForStudio),
        activeFeatures: this.activeFeatures,
        detectedFeatures: this.detectedFeatures,
      },
    };
  }

  async mcpGetPrompt(req: GetPromptRequest): Promise<GetPromptResult> {
    await this.detectProjectRoot();
    const promptName = req.params.name;
    const promptArgs = req.params.arguments || {};
    const prompt = this.getPrompt(promptName);
    if (!prompt) {
      throw new Error(`Prompt '${promptName}' could not be found.`);
    }

    let projectId = await this.getProjectId();
    projectId = projectId || "";

    const skipAutoAuthForStudio = isFirebaseStudio();
    const accountEmail = await this.getAuthenticatedUser(skipAutoAuthForStudio);

    const options = { projectDir: this.cachedProjectDir, cwd: this.cachedProjectDir };
    const promptsCtx: McpContext = {
      projectId: projectId,
      host: this,
      config: Config.load(options, true) || new Config({}, options),
      rc: loadRC(options),
      accountEmail,
    };

    try {
      const messages = await prompt.fn(promptArgs, promptsCtx);
      await this.trackGA4("mcp_get_prompt", {
        tool_name: promptName,
      });
      return {
        messages,
      };
    } catch (err: unknown) {
      await this.trackGA4("mcp_get_prompt", {
        tool_name: promptName,
        error: 1,
      });
      // TODO: should we return mcpError here?
      throw err;
    }
  }

  async mcpListResources(): Promise<ListResourcesResult> {
    return {
      resources: resources.map((r) => r.mcp),
    };
  }

  async mcpReadResource(req: ReadResourceRequest): Promise<ReadResourceResult> {
    const resource = resources.find((r) => r.mcp.uri === req.params.uri);

    let projectId = await this.getProjectId();
    projectId = projectId || "";

    const skipAutoAuthForStudio = isFirebaseStudio();
    const accountEmail = await this.getAuthenticatedUser(skipAutoAuthForStudio);

    const options = { projectDir: this.cachedProjectDir, cwd: this.cachedProjectDir };
    const resourceCtx: McpContext = {
      projectId: projectId,
      host: this,
      config: Config.load(options, true) || new Config({}, options),
      rc: loadRC(options),
      accountEmail,
    };

    if (!resource) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Resource '${req.params.uri}' could not be found.`,
      );
    }
    return resource.fn(req.params.uri, resourceCtx);
  }

  async start(): Promise<void> {
    const transport = process.env.FIREBASE_MCP_DEBUG_LOG
      ? new LoggingStdioServerTransport(process.env.FIREBASE_MCP_DEBUG_LOG)
      : new StdioServerTransport();
    await this.server.connect(transport);
  }

  private async log(level: LoggingLevel, message: unknown) {
    let data = message;

    // mcp protocol only takes jsons or it errors; for convienence, format
    // a a string into a json.
    if (typeof message === "string") {
      data = { message };
    }

    if (!this.currentLogLevel) {
      return;
    }

    if (orderedLogLevels.indexOf(this.currentLogLevel) > orderedLogLevels.indexOf(level)) {
      return;
    }

    if (this._ready) await this.server.sendLoggingMessage({ level, data });
  }
}
