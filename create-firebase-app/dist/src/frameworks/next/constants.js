"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBPACK_LAYERS = exports.ESBUILD_VERSION = exports.CONFIG_FILES = exports.SERVER_REFERENCE_MANIFEST = exports.APP_PATHS_MANIFEST = exports.ROUTES_MANIFEST = exports.PRERENDER_MANIFEST = exports.PAGES_MANIFEST = exports.MIDDLEWARE_MANIFEST = exports.IMAGES_MANIFEST = exports.EXPORT_MARKER = exports.APP_PATH_ROUTES_MANIFEST = void 0;
exports.APP_PATH_ROUTES_MANIFEST = "app-path-routes-manifest.json";
exports.EXPORT_MARKER = "export-marker.json";
exports.IMAGES_MANIFEST = "images-manifest.json";
exports.MIDDLEWARE_MANIFEST = "middleware-manifest.json";
exports.PAGES_MANIFEST = "pages-manifest.json";
exports.PRERENDER_MANIFEST = "prerender-manifest.json";
exports.ROUTES_MANIFEST = "routes-manifest.json";
exports.APP_PATHS_MANIFEST = "app-paths-manifest.json";
exports.SERVER_REFERENCE_MANIFEST = "server-reference-manifest.json";
exports.CONFIG_FILES = ["next.config.js", "next.config.mjs"];
exports.ESBUILD_VERSION = "^0.19.2";
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
};
// This is copied from Next.js source code to keep WEBPACK_LAYERS in sync with the Next.js definition.
exports.WEBPACK_LAYERS = Object.assign(Object.assign({}, WEBPACK_LAYERS_NAMES), { GROUP: {
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
    } });
