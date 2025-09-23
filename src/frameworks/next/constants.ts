import type {
  APP_PATH_ROUTES_MANIFEST as APP_PATH_ROUTES_MANIFEST_TYPE,
  EXPORT_MARKER as EXPORT_MARKER_TYPE,
  IMAGES_MANIFEST as IMAGES_MANIFEST_TYPE,
  MIDDLEWARE_MANIFEST as MIDDLEWARE_MANIFEST_TYPE,
  PAGES_MANIFEST as PAGES_MANIFEST_TYPE,
  PRERENDER_MANIFEST as PRERENDER_MANIFEST_TYPE,
  ROUTES_MANIFEST as ROUTES_MANIFEST_TYPE,
  APP_PATHS_MANIFEST as APP_PATHS_MANIFEST_TYPE,
  SERVER_REFERENCE_MANIFEST as SERVER_REFERENCE_MANIFEST_TYPE,
} from "next/constants";
import type { WEBPACK_LAYERS as NEXTJS_WEBPACK_LAYERS } from "next/dist/lib/constants";

export const APP_PATH_ROUTES_MANIFEST: typeof APP_PATH_ROUTES_MANIFEST_TYPE =
  "app-path-routes-manifest.json";
export const EXPORT_MARKER: typeof EXPORT_MARKER_TYPE = "export-marker.json";
export const IMAGES_MANIFEST: typeof IMAGES_MANIFEST_TYPE = "images-manifest.json";
export const MIDDLEWARE_MANIFEST: typeof MIDDLEWARE_MANIFEST_TYPE = "middleware-manifest.json";
export const PAGES_MANIFEST: typeof PAGES_MANIFEST_TYPE = "pages-manifest.json";
export const PRERENDER_MANIFEST: typeof PRERENDER_MANIFEST_TYPE = "prerender-manifest.json";
export const ROUTES_MANIFEST: typeof ROUTES_MANIFEST_TYPE = "routes-manifest.json";
export const APP_PATHS_MANIFEST: typeof APP_PATHS_MANIFEST_TYPE = "app-paths-manifest.json";
export const SERVER_REFERENCE_MANIFEST: `${typeof SERVER_REFERENCE_MANIFEST_TYPE}.json` =
  "server-reference-manifest.json";

export const CONFIG_FILES = ["next.config.js", "next.config.mjs"] as const;

export const ESBUILD_VERSION = "^0.19.2";

// This is copied from Next.js source code to keep WEBPACK_LAYERS in sync with the Next.js definition.
const WEBPACK_LAYERS_NAMES = {
  /**
   * The layer for the shared code between the client and server bundles.
   */ shared: "shared",
  /**
   * React Server Components layer (rsc).
   */ reactServerComponents: "rsc",
  /**
   * Server Side Rendering layer for app (ssr).
   */ serverSideRendering: "ssr",
  /**
   * The browser client bundle layer for actions.
   */ actionBrowser: "action-browser",
  /**
   * The layer for the API routes.
   */ api: "api",
  /**
   * The layer for the middleware code.
   */ middleware: "middleware",
  /**
   * The layer for assets on the edge.
   */ edgeAsset: "edge-asset",
  /**
   * The browser client bundle layer for App directory.
   */ appPagesBrowser: "app-pages-browser",
  /**
   * The server bundle layer for metadata routes.
   */ appMetadataRoute: "app-metadata-route",
  /**
   * The layer for the server bundle for App Route handlers.
   */ appRouteHandler: "app-route-handler",
} as const;

// This is copied from Next.js source code to keep WEBPACK_LAYERS in sync with the Next.js definition.
export const WEBPACK_LAYERS: typeof NEXTJS_WEBPACK_LAYERS = {
  ...WEBPACK_LAYERS_NAMES,
  GROUP: {
    server: [
      WEBPACK_LAYERS_NAMES.reactServerComponents,
      WEBPACK_LAYERS_NAMES.actionBrowser,
      WEBPACK_LAYERS_NAMES.appMetadataRoute,
      WEBPACK_LAYERS_NAMES.appRouteHandler,
    ],
    nonClientServerTarget: [
      // plus middleware and pages api
      WEBPACK_LAYERS_NAMES.middleware,
      WEBPACK_LAYERS_NAMES.api,
    ],
    app: [
      WEBPACK_LAYERS_NAMES.reactServerComponents,
      WEBPACK_LAYERS_NAMES.actionBrowser,
      WEBPACK_LAYERS_NAMES.appMetadataRoute,
      WEBPACK_LAYERS_NAMES.appRouteHandler,
      WEBPACK_LAYERS_NAMES.serverSideRendering,
      WEBPACK_LAYERS_NAMES.appPagesBrowser,
      WEBPACK_LAYERS_NAMES.shared,
    ],
  },
};
