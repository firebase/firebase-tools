import { RESOURCE_MIME_TYPE, getToolUiResourceUri, type McpUiSandboxProxyReadyNotification, AppBridge, PostMessageTransport, type McpUiResourceCsp, type McpUiResourcePermissions, buildAllowAttribute, type McpUiUpdateModelContextRequest, type McpUiMessageRequest } from "@modelcontextprotocol/ext-apps/app-bridge";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult, Resource, Tool } from "@modelcontextprotocol/sdk/types.js";
import { getTheme, onThemeChange } from "./theme";
import { HOST_STYLE_VARIABLES } from "./host-styles";


const SANDBOX_PROXY_BASE_URL = "http://localhost:8081/sandbox.html";
const IMPLEMENTATION = { name: "MCP Apps Host", version: "1.0.0" };


export const log = {
  info: console.log.bind(console, "[HOST]"),
  warn: console.warn.bind(console, "[HOST]"),
  error: console.error.bind(console, "[HOST]"),
};


export interface ServerInfo {
  name: string;
  client: Client;
  tools: Map<string, Tool>;
  resources: Map<string, Resource>;
  appHtmlCache: Map<string, string>;
}


export async function connectToServer(serverUrl: URL): Promise<ServerInfo> {
  log.info("Connecting to server:", serverUrl.href);
  const client = await connectWithFallback(serverUrl);

  const name = client.getServerVersion()?.name ?? serverUrl.href;

  const toolsList = await client.listTools();
  const tools = new Map(toolsList.tools.map((tool) => [tool.name, tool]));
  log.info("Server tools:", Array.from(tools.keys()));

  // Fetch resources for listing-level _meta.ui (fallback for content-level)
  const resourcesList = await client.listResources();
  const resources = new Map(resourcesList.resources.map((r) => [r.uri, r]));
  log.info("Server resources:", Array.from(resources.keys()));

  return { name, client, tools, resources, appHtmlCache: new Map() };
}

async function connectWithFallback(serverUrl: URL): Promise<Client> {
  // Try Streamable HTTP first (modern transport)
  try {
    const client = new Client(IMPLEMENTATION);
    await client.connect(new StreamableHTTPClientTransport(serverUrl));
    log.info("Connected via Streamable HTTP transport");
    return client;
  } catch (streamableError) {
    log.info("Streamable HTTP failed:", streamableError);
  }

  // Fall back to SSE (deprecated but needed for older servers)
  try {
    const client = new Client(IMPLEMENTATION);
    await client.connect(new SSEClientTransport(serverUrl));
    log.info("Connected via SSE transport");
    return client;
  } catch (sseError) {
    throw new Error(`Could not connect with any transport. SSE error: ${sseError}`);
  }
}


interface UiResourceData {
  html: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
}

export interface ToolCallInfo {
  serverInfo: ServerInfo;
  tool: Tool;
  input: Record<string, unknown>;
  resultPromise: Promise<CallToolResult>;
  appResourcePromise?: Promise<UiResourceData>;
}


export function hasAppHtml(toolCallInfo: ToolCallInfo): toolCallInfo is Required<ToolCallInfo> {
  return !!toolCallInfo.appResourcePromise;
}


export function callTool(
  serverInfo: ServerInfo,
  name: string,
  input: Record<string, unknown>,
): ToolCallInfo {
  log.info("Calling tool", name, "with input", input);
  const resultPromise = serverInfo.client.callTool({ name, arguments: input }) as Promise<CallToolResult>;

  const tool = serverInfo.tools.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const toolCallInfo: ToolCallInfo = { serverInfo, tool, input, resultPromise };

  const uiResourceUri = getToolUiResourceUri(tool);
  if (uiResourceUri) {
    toolCallInfo.appResourcePromise = getUiResource(serverInfo, uiResourceUri);
  }

  return toolCallInfo;
}


async function getUiResource(serverInfo: ServerInfo, uri: string): Promise<UiResourceData> {
  log.info("Reading UI resource:", uri);
  const resource = await serverInfo.client.readResource({ uri });

  if (!resource) {
    throw new Error(`Resource not found: ${uri}`);
  }

  if (resource.contents.length !== 1) {
    throw new Error(`Unexpected contents count: ${resource.contents.length}`);
  }

  const content = resource.contents[0];

  // Per the MCP App specification, "text/html;profile=mcp-app" signals this
  // resource is indeed for an MCP App UI.
  if (content.mimeType !== RESOURCE_MIME_TYPE) {
    throw new Error(`Unsupported MIME type: ${content.mimeType}`);
  }

  const html = "blob" in content ? atob(content.blob) : content.text;

  // Extract CSP and permissions metadata, preferring content-level (resources/read)
  // and falling back to listing-level (resources/list) per the spec
  log.info("Resource content keys:", Object.keys(content));
  log.info("Resource content._meta:", (content as any)._meta);

  // Try both _meta (spec) and meta (Python SDK quirk) for content-level
  const contentMeta = (content as any)._meta || (content as any).meta;

  // Get listing-level metadata as fallback
  const listingResource = serverInfo.resources.get(uri);
  const listingMeta = (listingResource as any)?._meta;
  log.info("Resource listing._meta:", listingMeta);

  // Content-level takes precedence, fall back to listing-level
  const uiMeta = contentMeta?.ui ?? listingMeta?.ui;
  const csp = uiMeta?.csp;
  const permissions = uiMeta?.permissions;

  return { html, csp, permissions };
}


export function loadSandboxProxy(
  iframe: HTMLIFrameElement,
  csp?: McpUiResourceCsp,
  permissions?: McpUiResourcePermissions,
): Promise<boolean> {
  // Prevent reload
  if (iframe.src) return Promise.resolve(false);

  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");

  // Set Permission Policy allow attribute based on requested permissions
  const allowAttribute = buildAllowAttribute(permissions);
  if (allowAttribute) {
    iframe.setAttribute("allow", allowAttribute);
  }

  const readyNotification: McpUiSandboxProxyReadyNotification["method"] =
    "ui/notifications/sandbox-proxy-ready";

  const readyPromise = new Promise<boolean>((resolve) => {
    const listener = ({ source, data }: MessageEvent) => {
      if (source === iframe.contentWindow && data?.method === readyNotification) {
        log.info("Sandbox proxy loaded")
        window.removeEventListener("message", listener);
        resolve(true);
      }
    };
    window.addEventListener("message", listener);
  });

  // Build sandbox URL with CSP query param for HTTP header-based CSP
  const sandboxUrl = new URL(SANDBOX_PROXY_BASE_URL);
  if (csp) {
    sandboxUrl.searchParams.set("csp", JSON.stringify(csp));
  }

  log.info("Loading sandbox proxy...", csp ? `(CSP: ${JSON.stringify(csp)})` : "");
  iframe.src = sandboxUrl.href;

  return readyPromise;
}


export async function initializeApp(
  iframe: HTMLIFrameElement,
  appBridge: AppBridge,
  { input, resultPromise, appResourcePromise }: Required<ToolCallInfo>,
): Promise<void> {
  const appInitializedPromise = hookInitializedCallback(appBridge);

  // Connect app bridge (triggers MCP initialization handshake)
  //
  // IMPORTANT: Pass `iframe.contentWindow` as BOTH target and source to ensure
  // this proxy only responds to messages from its specific iframe.
  await appBridge.connect(
    new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!),
  );

  // Load inner iframe HTML with CSP and permissions metadata
  const { html, csp, permissions } = await appResourcePromise;
  log.info("Sending UI resource HTML to MCP App", csp ? `(CSP: ${JSON.stringify(csp)})` : "", permissions ? `(Permissions: ${JSON.stringify(permissions)})` : "");
  await appBridge.sendSandboxResourceReady({ html, csp, permissions });

  // Wait for inner iframe to be ready
  log.info("Waiting for MCP App to initialize...");
  await appInitializedPromise;
  log.info("MCP App initialized");

  // Send tool call input to iframe
  log.info("Sending tool call input to MCP App:", input);
  appBridge.sendToolInput({ arguments: input });

  // Schedule tool call result (or cancellation) to be sent to MCP App
  resultPromise.then(
    (result) => {
      log.info("Sending tool call result to MCP App:", result);
      appBridge.sendToolResult(result);
    },
    (error) => {
      log.error("Tool call failed, sending cancellation to MCP App:", error);
      appBridge.sendToolCancelled({
        reason: error instanceof Error ? error.message : String(error),
      });
    },
  );
}

/**
 * Hooks into `AppBridge.oninitialized` and returns a Promise that resolves when
 * the MCP App is initialized (i.e., when the inner iframe is ready).
 */
function hookInitializedCallback(appBridge: AppBridge): Promise<void> {
  const oninitialized = appBridge.oninitialized;
  return new Promise<void>((resolve) => {
    appBridge.oninitialized = (...args) => {
      resolve();
      appBridge.oninitialized = oninitialized;
      appBridge.oninitialized?.(...args);
    };
  });
}


export type ModelContext = McpUiUpdateModelContextRequest["params"];
export type AppMessage = McpUiMessageRequest["params"];

export interface AppBridgeCallbacks {
  onContextUpdate?: (context: ModelContext | null) => void;
  onMessage?: (message: AppMessage) => void;
  onDisplayModeChange?: (mode: "inline" | "fullscreen") => void;
}

export interface AppBridgeOptions {
  containerDimensions?: { maxHeight?: number; width?: number } | { height: number; width?: number };
  displayMode?: "inline" | "fullscreen";
}

export function newAppBridge(
  serverInfo: ServerInfo,
  iframe: HTMLIFrameElement,
  callbacks?: AppBridgeCallbacks,
  options?: AppBridgeOptions,
): AppBridge {
  const serverCapabilities = serverInfo.client.getServerCapabilities();
  const appBridge = new AppBridge(serverInfo.client, IMPLEMENTATION, {
    openLinks: {},
    serverTools: serverCapabilities?.tools,
    serverResources: serverCapabilities?.resources,
    // Declare support for model context updates
    updateModelContext: { text: {} },
  }, {
    // Pass initial host context with theme, display mode, and style variables
    hostContext: {
      theme: getTheme(),
      platform: "web",
      styles: {
        variables: HOST_STYLE_VARIABLES,
      },
      containerDimensions: options?.containerDimensions ?? { maxHeight: 6000 },
      displayMode: options?.displayMode ?? "inline",
      availableDisplayModes: ["inline", "fullscreen"],
    },
  });

  // Listen for theme changes (from toggle or system) and notify the app
  onThemeChange((newTheme) => {
    log.info("Theme changed:", newTheme);
    appBridge.sendHostContextChange({ theme: newTheme });
  });

  // Per spec, the host SHOULD notify the view when container dimensions
  // change. A ResizeObserver on the iframe covers window resize, layout
  // shifts, and the inline↔fullscreen panel toggle (which React applies
  // a tick after onrequestdisplaymode returns — sending containerDimensions
  // alongside displayMode there would race the layout). Height stays
  // flexible (maxHeight) so the view can keep driving it via sendSizeChanged.
  const iframeResizeObserver = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width > 0) {
      appBridge.sendHostContextChange({
        containerDimensions: { width, maxHeight: 6000 },
      });
    }
  });
  iframeResizeObserver.observe(iframe);
  // AppBridge inherits Protocol's onclose hook — chain disposal there.
  const prevOnclose = appBridge.onclose;
  appBridge.onclose = () => {
    iframeResizeObserver.disconnect();
    prevOnclose?.();
  };

  // Register all handlers before calling connect(). The view can start
  // sending requests immediately after the initialization handshake, so any
  // handlers registered after connect() might miss early requests.

  appBridge.onmessage = async (params, _extra) => {
    log.info("Message from MCP App:", params);
    callbacks?.onMessage?.(params);
    return {};
  };

  appBridge.onopenlink = async (params, _extra) => {
    log.info("Open link request:", params);
    window.open(params.url, "_blank", "noopener,noreferrer");
    return {};
  };

  appBridge.onloggingmessage = (params) => {
    log.info("Log message from MCP App:", params);
  };

  appBridge.onupdatemodelcontext = async (params) => {
    log.info("Model context update from MCP App:", params);
    // Normalize: empty content array means clear context
    const hasContent = params.content && params.content.length > 0;
    const hasStructured = params.structuredContent && Object.keys(params.structuredContent).length > 0;
    callbacks?.onContextUpdate?.(hasContent || hasStructured ? params : null);
    return {};
  };

  appBridge.onsizechange = async ({ width, height }) => {
    // The MCP App has requested a `width` and `height`, but if
    // `box-sizing: border-box` is applied to the outer iframe element, then we
    // must add border thickness to `width` and `height` to compute the actual
    // necessary width and height (in order to prevent a resize feedback loop).
    const style = getComputedStyle(iframe);
    const isBorderBox = style.boxSizing === "border-box";

    // Animate the change for a smooth transition.
    const from: Keyframe = {};
    const to: Keyframe = {};

    if (width !== undefined) {
      if (isBorderBox) {
        width += parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      }
      // Use min-width instead of width to allow responsive growing.
      // With auto-resize (the default), the app reports its minimum content
      // width; we honor that as a floor but allow the iframe to expand when
      // the host layout allows. And we use `min(..., 100%)` so that the iframe
      // shrinks with its container.
      from.minWidth = `${iframe.offsetWidth}px`;
      iframe.style.minWidth = to.minWidth = `min(${width}px, 100%)`;
    }
    if (height !== undefined) {
      if (isBorderBox) {
        height += parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      }
      from.height = `${iframe.offsetHeight}px`;
      iframe.style.height = to.height = `${height}px`;
    }

    iframe.animate([from, to], { duration: 300, easing: "ease-out" });
  };

  // Handle display mode change requests from the app
  appBridge.onrequestdisplaymode = async (params) => {
    log.info("Display mode request from MCP App:", params);
    const newMode = params.mode === "fullscreen" ? "fullscreen" : "inline";
    // Update host context and notify the app
    appBridge.sendHostContextChange({
      displayMode: newMode,
    });
    // Notify the host UI (via callback)
    callbacks?.onDisplayModeChange?.(newMode);
    return { mode: newMode };
  };

  return appBridge;
}
