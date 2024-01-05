import type {
  APP_PATH_ROUTES_MANIFEST as APP_PATH_ROUTES_MANIFEST_TYPE,
  EXPORT_MARKER as EXPORT_MARKER_TYPE,
  IMAGES_MANIFEST as IMAGES_MANIFEST_TYPE,
  MIDDLEWARE_MANIFEST as MIDDLEWARE_MANIFEST_TYPE,
  PAGES_MANIFEST as PAGES_MANIFEST_TYPE,
  PRERENDER_MANIFEST as PRERENDER_MANIFEST_TYPE,
  ROUTES_MANIFEST as ROUTES_MANIFEST_TYPE,
  APP_PATHS_MANIFEST as APP_PATHS_MANIFEST_TYPE,
} from "next/constants";

export const APP_PATH_ROUTES_MANIFEST: typeof APP_PATH_ROUTES_MANIFEST_TYPE =
  "app-path-routes-manifest.json";
export const EXPORT_MARKER: typeof EXPORT_MARKER_TYPE = "export-marker.json";
export const IMAGES_MANIFEST: typeof IMAGES_MANIFEST_TYPE = "images-manifest.json";
export const MIDDLEWARE_MANIFEST: typeof MIDDLEWARE_MANIFEST_TYPE = "middleware-manifest.json";
export const PAGES_MANIFEST: typeof PAGES_MANIFEST_TYPE = "pages-manifest.json";
export const PRERENDER_MANIFEST: typeof PRERENDER_MANIFEST_TYPE = "prerender-manifest.json";
export const ROUTES_MANIFEST: typeof ROUTES_MANIFEST_TYPE = "routes-manifest.json";
export const APP_PATHS_MANIFEST: typeof APP_PATHS_MANIFEST_TYPE = "app-paths-manifest.json";
// TODO: import from next/constants after bumping Next.js dependency
export const SERVER_REFERENCE_MANIFEST = "server-reference-manifest.json";

export const ESBUILD_VERSION = "0.19.2";

// TODO: import from next/constants after bumping Next.js dependency
/**
 * The names of the webpack layers. These layers are the primitives for the
 * webpack chunks.
 */
export const WEBPACK_LAYERS_NAMES = {
  /**
   * The layer for the shared code between the client and server bundles.
   */
  shared: "shared",
  /**
   * React Server Components layer (rsc).
   */
  reactServerComponents: "rsc",
  /**
   * Server Side Rendering layer for app (ssr).
   */
  serverSideRendering: "ssr",
  /**
   * The browser client bundle layer for actions.
   */
  actionBrowser: "action-browser",
  /**
   * The layer for the API routes.
   */
  api: "api",
  /**
   * The layer for the middleware code.
   */
  middleware: "middleware",
  /**
   * The layer for assets on the edge.
   */
  edgeAsset: "edge-asset",
  /**
   * The browser client bundle layer for App directory.
   */
  appPagesBrowser: "app-pages-browser",
  /**
   * The server bundle layer for metadata routes.
   */
  appMetadataRoute: "app-metadata-route",
  /**
   * The layer for the server bundle for App Route handlers.
   */
  appRouteHandler: "app-route-handler",
} as const;
