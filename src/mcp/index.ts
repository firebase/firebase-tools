import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  GetPromptRequest,
  GetPromptRequestSchema,
  GetPromptResult,
  ListPromptsRequestSchema,
  ListPromptsResult,
  ListResourcesRequestSchema,
  ListResourcesResult,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResult,
  ListToolsRequestSchema,
  ListToolsResult,
  LoggingLevel,
  McpError,
  ReadResourceRequest,
  ReadResourceRequestSchema,
  ReadResourceResult,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as crossSpawn from "cross-spawn";
import { existsSync } from "node:fs";
import { Command } from "../command";
import { Config } from "../config";
import { configstore } from "../configstore";
import { EmulatorHubClient } from "../emulator/hubClient";
import { Emulators } from "../emulator/types";
import { isFirebaseStudio } from "../env";
import { Options } from "../options";
import { getProjectId } from "../projectUtils";
import { loadRC } from "../rc";
import { requireAuth } from "../requireAuth";
import { timeoutFallback } from "../timeout";
import { trackGA4 } from "../track";
import { mcpAuthError, NO_PROJECT_ERROR, noProjectDirectory, requireGeminiToS } from "./errors";
import { LoggingStdioServerTransport } from "./logging-transport";
import { ServerPrompt } from "./prompt";
import { availablePrompts } from "./prompts/index";
import { resolveResource, resources, resourceTemplates } from "./resources";
import { ServerTool } from "./tool";
import { availableTools } from "./tools/index";
import { ClientConfig, McpContext, SERVER_FEATURES, ServerFeature } from "./types";
import { mcpError } from "./util";
import { getDefaultFeatureAvailabilityCheck } from "./util/availability";
import { checkBillingEnabled } from "../gcp/cloudbilling";

const SERVER_VERSION = "0.3.0";

const cmd = new Command("mcp");

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
  private _ready = false;
  private _readyPromises: { resolve: () => void; reject: (err: unknown) => void }[] = [];
  private _pendingMessages: { level: LoggingLevel; data: unknown }[] = [];
  startupRoot?: string;
  cachedProjectDir?: string;
  server: Server;
  activeFeatures?: ServerFeature[];
  detectedFeatures?: ServerFeature[];
  enabledTools?: string[];
  clientInfo?: { name?: string; version?: string };
  emulatorHubClient?: EmulatorHubClient;
  private cliCommand?: string;

  // logging spec:
  // https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/logging
  currentLogLevel?: LoggingLevel = process.env.FIREBASE_MCP_DEBUG_LOG ? "debug" : undefined;

  /** Create a special tracking function to avoid blocking everything on initialization notification. */
  private async trackGA4(
    event: Parameters<typeof trackGA4>[0],
    params: Parameters<typeof trackGA4>[1] = {},
  ): Promise<void> {
    // wait until ready or until 2s has elapsed
    if (!this.clientInfo) await timeoutFallback(this.ready(), null, 2000);
    const clientInfoParams: {
      mcp_client_name: string;
      mcp_client_version: string;
      gemini_cli_extension: string;
    } = {
      mcp_client_name: this.clientInfo?.name || "<unknown-client>",
      mcp_client_version: this.clientInfo?.version || "<unknown-version>",
      gemini_cli_extension: process.env.IS_GEMINI_CLI_EXTENSION ? "true" : "false",
    };
    return trackGA4(event, { ...params, ...clientInfoParams });
  }

  constructor(options: {
    activeFeatures?: ServerFeature[];
    projectRoot?: string;
    enabledTools?: string[];
  }) {
    this.activeFeatures = options.activeFeatures;
    this.startupRoot = options.projectRoot || process.env.PROJECT_ROOT;
    this.enabledTools = options.enabledTools;
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
    this.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      this.mcpListResourceTemplates.bind(this),
    );
    this.server.setRequestHandler(ListResourcesRequestSchema, this.mcpListResources.bind(this));
    this.server.setRequestHandler(ReadResourceRequestSchema, this.mcpReadResource.bind(this));
    const onInitialized = (): void => {
      const clientInfo = this.server.getClientVersion();
      this.clientInfo = clientInfo;
      if (clientInfo?.name) {
        void this.trackGA4("mcp_client_connected");
      }
      if (!this.clientInfo?.name) this.clientInfo = { name: "<unknown-client>" };

      this._ready = true;
      while (this._readyPromises.length) {
        this._readyPromises.pop()?.resolve();
      }
    };

    this.server.oninitialized = () => {
      void onInitialized();
    };

    this.server.setRequestHandler(SetLevelRequestSchema, async ({ params }) => {
      this.currentLogLevel = params.level;
      return {};
    });

    void this.detectProjectSetup();
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

  async detectProjectSetup(): Promise<void> {
    await this.detectProjectRoot();
    // Detecting active features requires that the project directory has been appropriately set
    await this.detectActiveFeatures();
  }

  async detectProjectRoot(): Promise<string> {
    await timeoutFallback(this.ready(), null, 2000);
    if (this.cachedProjectDir) return this.cachedProjectDir;
    const storedRoot = this.getStoredClientConfig().projectRoot;
    this.cachedProjectDir = storedRoot || this.startupRoot || process.cwd();
    this.logger.debug(`detected and cached project root: ${this.cachedProjectDir}`);
    return this.cachedProjectDir;
  }

  async detectActiveFeatures(): Promise<ServerFeature[]> {
    if (this.detectedFeatures?.length) return this.detectedFeatures; // memoized
    this.logger.debug("detecting active features of Firebase MCP server...");
    const projectId = (await this.getProjectId()) || "";
    const accountEmail = await this.getAuthenticatedUser();
    const isBillingEnabled = projectId ? await checkBillingEnabled(projectId) : false;
    const ctx = this._createMcpContext(projectId, accountEmail, isBillingEnabled);
    const detected = await Promise.all(
      SERVER_FEATURES.map(async (f) => {
        const availabilityCheck = getDefaultFeatureAvailabilityCheck(f);
        if (await availabilityCheck(ctx)) return f;
        return null;
      }),
    );
    this.detectedFeatures = detected.filter((f) => !!f) as ServerFeature[];
    this.logger.debug(
      `detected features of Firebase MCP server:  ${this.detectedFeatures.join(", ") || "<none>"}`,
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

  async getAvailableTools(): Promise<ServerTool[]> {
    const features = this.activeFeatures?.length ? this.activeFeatures : this.detectedFeatures;
    // We need a project ID and user for the context, but it's ok if they're empty.
    const projectId = (await this.getProjectId()) || "";
    const accountEmail = await this.getAuthenticatedUser();
    const isBillingEnabled = projectId ? await checkBillingEnabled(projectId) : false;
    const ctx = this._createMcpContext(projectId, accountEmail, isBillingEnabled);
    return availableTools(ctx, features, this.enabledTools);
  }

  async getTool(name: string): Promise<ServerTool | null> {
    const tools = await this.getAvailableTools();
    return tools.find((t) => t.mcp.name === name) || null;
  }

  async getAvailablePrompts(): Promise<ServerPrompt[]> {
    const features = this.activeFeatures?.length ? this.activeFeatures : this.detectedFeatures;
    // We need a project ID and user for the context, but it's ok if they're empty.
    const projectId = (await this.getProjectId()) || "";
    const accountEmail = await this.getAuthenticatedUser();
    const isBillingEnabled = projectId ? await checkBillingEnabled(projectId) : false;
    const ctx = this._createMcpContext(projectId, accountEmail, isBillingEnabled);
    return availablePrompts(ctx, features);
  }

  async getPrompt(name: string): Promise<ServerPrompt | null> {
    const prompts = await this.getAvailablePrompts();
    return prompts.find((p) => p.mcp.name === name) || null;
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
    await cmd.prepare(options as Options);
    return options;
  }

  async getProjectId(): Promise<string | undefined> {
    return getProjectId(await this.resolveOptions());
  }

  async getAuthenticatedUser(skipAutoAuth: boolean = false): Promise<string | null> {
    try {
      this.logger.debug("calling requireAuth");
      const email = await requireAuth(await this.resolveOptions(), skipAutoAuth);
      this.logger.debug(`detected authenticated account: ${email || "<none>"}`);
      return email ?? (skipAutoAuth ? null : "Application Default Credentials");
    } catch (e) {
      this.logger.debug(`error in requireAuth: ${e}`);
      return null;
    }
  }

  private _createMcpContext(
    projectId: string,
    accountEmail: string | null,
    isBillingEnabled: boolean,
  ): McpContext {
    const options = { projectDir: this.cachedProjectDir, cwd: this.cachedProjectDir };
    return {
      projectId: projectId,
      host: this,
      config: Config.load(options, true) || new Config({}, options),
      rc: loadRC(options),
      accountEmail,
      firebaseCliCommand: this._getFirebaseCliCommand(),
      isBillingEnabled,
    };
  }

  private _getFirebaseCliCommand(): string {
    if (!this.cliCommand) {
      const testCommand = crossSpawn.sync("firebase --version");
      this.cliCommand = testCommand.error ? "npx firebase-tools@latest" : "firebase";
    }
    return this.cliCommand;
  }

  async mcpListTools(): Promise<ListToolsResult> {
    await Promise.all([this.detectActiveFeatures(), this.detectProjectRoot()]);
    const hasActiveProject = !!(await this.getProjectId());
    await this.trackGA4("mcp_list_tools");
    const skipAutoAuthForStudio = isFirebaseStudio();
    this.logger.debug(`skip auto-auth in studio environment: ${skipAutoAuthForStudio}`);
    const availableTools = await this.getAvailableTools();
    return {
      tools: availableTools.map((t) => t.mcp),
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
    const tool = await this.getTool(toolName);
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

    const isBillingEnabled = projectId ? await checkBillingEnabled(projectId) : false;
    const toolsCtx = this._createMcpContext(projectId, accountEmail, isBillingEnabled);
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
      prompts: (await this.getAvailablePrompts()).map((p) => ({
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
    const prompt = await this.getPrompt(promptName);
    if (!prompt) {
      throw new Error(`Prompt '${promptName}' could not be found.`);
    }

    let projectId = await this.getProjectId();
    projectId = projectId || "";

    const skipAutoAuthForStudio = isFirebaseStudio();
    const accountEmail = await this.getAuthenticatedUser(skipAutoAuthForStudio);

    const isBillingEnabled = projectId ? await checkBillingEnabled(projectId) : false;
    const promptsCtx = this._createMcpContext(projectId, accountEmail, isBillingEnabled);

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
    await trackGA4("mcp_read_resource", { resource_name: "__list__" });
    return {
      resources: resources.map((r) => r.mcp),
    };
  }

  async mcpListResourceTemplates(): Promise<ListResourceTemplatesResult> {
    return {
      resourceTemplates: resourceTemplates.map((rt) => rt.mcp),
    };
  }

  async mcpReadResource(req: ReadResourceRequest): Promise<ReadResourceResult> {
    let projectId = await this.getProjectId();
    projectId = projectId || "";

    const skipAutoAuthForStudio = isFirebaseStudio();
    const accountEmail = await this.getAuthenticatedUser(skipAutoAuthForStudio);

    const isBillingEnabled = projectId ? await checkBillingEnabled(projectId) : false;
    const resourceCtx = this._createMcpContext(projectId, accountEmail, isBillingEnabled);

    const resolved = await resolveResource(req.params.uri, resourceCtx);
    if (!resolved) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Resource '${req.params.uri}' could not be found.`,
      );
    }
    return resolved.result;
  }

  async start(): Promise<void> {
    const transport = process.env.FIREBASE_MCP_DEBUG_LOG
      ? new LoggingStdioServerTransport(process.env.FIREBASE_MCP_DEBUG_LOG)
      : new StdioServerTransport();
    await this.server.connect(transport);
  }

  get logger() {
    const logAtLevel = (level: LoggingLevel, message: unknown): void => {
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

      if (this._ready) {
        // once ready, flush all pending messages before sending the next message
        // this should only happen during startup
        while (this._pendingMessages.length) {
          const message = this._pendingMessages.shift();
          if (!message) continue;
          this.server.sendLoggingMessage({
            level: message.level,
            data: message.data,
          });
        }

        void this.server.sendLoggingMessage({ level, data });
      } else {
        this._pendingMessages.push({ level, data });
      }
    };

    return Object.fromEntries(
      orderedLogLevels.map((logLevel) => [
        logLevel,
        (message: unknown) => logAtLevel(logLevel, message),
      ]),
    ) as Record<LoggingLevel, (message: unknown) => Promise<void>>;
  }
}
