import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { checkFeatureActive, mcpError } from "./util.js";
import { ClientConfig, SERVER_FEATURES, ServerFeature } from "./types.js";
import { availableTools } from "./tools/index.js";
import { ServerTool, ServerToolContext } from "./tool.js";
import { configstore } from "../configstore.js";
import { Command } from "../command.js";
import { requireAuth } from "../requireAuth.js";
import { Options } from "../options.js";
import { getProjectId } from "../projectUtils.js";
import { mcpAuthError, NO_PROJECT_ERROR, mcpGeminiError } from "./errors.js";
import { trackGA4 } from "../track.js";
import { Config } from "../config.js";
import { loadRC } from "../rc.js";
import { EmulatorHubClient } from "../emulator/hubClient.js";
import { Emulators } from "../emulator/types.js";
import { existsSync } from "node:fs";
import { ensure, check } from "../ensureApiEnabled.js";
import * as api from "../api.js";

const SERVER_VERSION = "0.1.0";

const cmd = new Command("experimental:mcp").before(requireAuth);

export class FirebaseMcpServer {
  private _ready: boolean = false;
  private _readyPromises: { resolve: () => void; reject: (err: unknown) => void }[] = [];
  startupRoot?: string;
  cachedProjectRoot?: string;
  server: Server;
  activeFeatures?: ServerFeature[];
  detectedFeatures?: ServerFeature[];
  clientInfo?: { name?: string; version?: string };
  emulatorHubClient?: EmulatorHubClient;

  constructor(options: { activeFeatures?: ServerFeature[]; projectRoot?: string }) {
    this.activeFeatures = options.activeFeatures;
    this.startupRoot = options.projectRoot || process.env.PROJECT_ROOT;
    this.server = new Server({ name: "firebase", version: SERVER_VERSION });
    this.server.registerCapabilities({ tools: { listChanged: true } });
    this.server.setRequestHandler(ListToolsRequestSchema, this.mcpListTools.bind(this));
    this.server.setRequestHandler(CallToolRequestSchema, this.mcpCallTool.bind(this));
    this.server.oninitialized = async () => {
      const clientInfo = this.server.getClientVersion();
      this.clientInfo = clientInfo;
      if (clientInfo?.name) {
        trackGA4("mcp_client_connected", {
          mcp_client_name: clientInfo.name,
          mcp_client_version: clientInfo.version,
        });
      }
      if (!this.clientInfo?.name) this.clientInfo = { name: "<unknown-client>" };

      this._ready = true;
      while (this._readyPromises.length) {
        this._readyPromises.pop()?.resolve();
      }
    };
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

  private get clientConfigKey() {
    return `mcp.clientConfigs.${this.clientInfo?.name || "<unknown-client>"}:${this.startupRoot || process.cwd()}`;
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
    await this.ready();
    if (this.cachedProjectRoot) return this.cachedProjectRoot;
    const storedRoot = this.getStoredClientConfig().projectRoot;
    this.cachedProjectRoot = storedRoot || this.startupRoot || process.cwd();
    return this.cachedProjectRoot;
  }

  async detectActiveFeatures(): Promise<ServerFeature[]> {
    if (this.detectedFeatures?.length) return this.detectedFeatures; // memoized
    const options = await this.resolveOptions();
    const projectId = await this.getProjectId();
    const detected = await Promise.all(
      SERVER_FEATURES.map(async (f) => {
        if (await checkFeatureActive(f, projectId, options)) return f;
        return null;
      }),
    );
    this.detectedFeatures = detected.filter((f) => !!f) as ServerFeature[];
    return this.detectedFeatures;
  }

  async getEmulatorHubClient(): Promise<EmulatorHubClient | undefined> {
    // Single initilization
    if (this.emulatorHubClient) {
      return this.emulatorHubClient;
    }
    const projectId = await this.getProjectId();
    if (!projectId) {
      return;
    }
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
        "No Firestore Emulator found running. Make sure your project firebase.json file includes firestore and then rerun emulator using `firebase emulators:start` from your project directory.",
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

  setProjectRoot(newRoot: string | null): void {
    this.updateStoredClientConfig({ projectRoot: newRoot });
    this.cachedProjectRoot = newRoot || undefined;
    this.detectedFeatures = undefined; // reset detected features
    void this.server.sendToolListChanged();
  }

  async resolveOptions(): Promise<Partial<Options>> {
    const options: Partial<Options> = { cwd: this.cachedProjectRoot, isMCP: true };
    await cmd.prepare(options);
    return options;
  }

  async getProjectId(): Promise<string | undefined> {
    return getProjectId(await this.resolveOptions());
  }

  async getAuthenticatedUser(): Promise<string | null> {
    try {
      const email = await requireAuth(await this.resolveOptions());
      return email ?? "Application Default Credentials";
    } catch (e) {
      return null;
    }
  }

  async mcpListTools(): Promise<ListToolsResult> {
    await Promise.all([this.detectActiveFeatures(), this.detectProjectRoot()]);
    const hasActiveProject = !!(await this.getProjectId());
    await trackGA4("mcp_list_tools", {
      mcp_client_name: this.clientInfo?.name,
      mcp_client_version: this.clientInfo?.version,
    });
    return {
      tools: this.availableTools.map((t) => t.mcp),
      _meta: {
        projectRoot: this.cachedProjectRoot,
        projectDetected: hasActiveProject,
        authenticatedUser: await this.getAuthenticatedUser(),
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
    if (
      tool.mcp.name !== "firebase_update_environment" && // allow this tool only, to fix the issue
      (!this.cachedProjectRoot || !existsSync(this.cachedProjectRoot))
    ) {
      return mcpError(
        `The current project directory '${this.cachedProjectRoot || "<NO PROJECT DIRECTORY FOUND>"}' does not exist. Please use the 'update_firebase_environment' tool to target a different project directory.`,
      );
    }

    // Check if the project ID is set.
    let projectId = await this.getProjectId();
    if (tool.mcp._meta?.requiresProject && !projectId) {
      return NO_PROJECT_ERROR;
    }
    projectId = projectId || "";

    // Check if the user is logged in.
    const accountEmail = await this.getAuthenticatedUser();
    if (tool.mcp._meta?.requiresAuth && !accountEmail) {
      return mcpAuthError();
    }

    // Check if the tool requires Gemini in Firebase API.
    if (tool.mcp._meta?.requiresGemini) {
      if (configstore.get("gemini")) {
        await ensure(projectId, api.cloudAiCompanionOrigin(), "");
      } else {
        if (!(await check(projectId, api.cloudAiCompanionOrigin(), ""))) {
          return mcpGeminiError(projectId);
        }
      }
    }

    const options = { projectDir: this.cachedProjectRoot, cwd: this.cachedProjectRoot };
    const toolsCtx: ServerToolContext = {
      projectId: projectId,
      host: this,
      config: Config.load(options, true) || new Config({}, options),
      rc: loadRC(options),
      accountEmail,
    };
    try {
      const res = await tool.fn(toolArgs, toolsCtx);
      await trackGA4("mcp_tool_call", {
        tool_name: toolName,
        error: res.isError ? 1 : 0,
        mcp_client_name: this.clientInfo?.name,
        mcp_client_version: this.clientInfo?.version,
      });
      return res;
    } catch (err: unknown) {
      await trackGA4("mcp_tool_call", {
        tool_name: toolName,
        error: 1,
        mcp_client_name: this.clientInfo?.name,
        mcp_client_version: this.clientInfo?.version,
      });
      return mcpError(err);
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
