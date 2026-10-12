import type {
  MiddlewareManifestV1,
  MiddlewareManifestV2,
  MiddlewareManifestV3,
  FunctionsConfigManifest,
} from "../interfaces";

export const middlewareV3ManifestWhenUsed: MiddlewareManifestV3 = {
  sortedMiddleware: [],
  middleware: {},
  functions: {},
  version: 3,
};

export const functionsConfigManifestWhenUsed: FunctionsConfigManifest = {
  version: 1,
  functions: {
    "/_middleware": {
      runtime: "nodejs",
      matchers: [
        {
          regexp: "^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/(\\.json)?[\\/#\\?]?$",
          originalSource: "/",
        },
      ],
    },
  },
};

export const middlewareV3ManifestWhenNotUsed: MiddlewareManifestV3 = {
  version: 3,
  middleware: {},
  sortedMiddleware: [],
  functions: {},
};

export const functionsConfigManifestWhenNotUsed: FunctionsConfigManifest = {
  version: 1,
  functions: {},
};

export const middlewareV3ManifestWithDeprecatedMiddleware: MiddlewareManifestV3 = {
  version: 3,
  middleware: {
    "/": {
      files: [
        "server/edge/chunks/[root-of-the-server]__123._.js",
        "server/edge/chunks/node_modules_next_dist_123._.js",
        "server/edge/chunks/turbopack-edge-wrapper_123.js",
      ],
      name: "middleware",
      page: "/",
      matchers: [
        {
          regexp: "^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/(\\\\.json)?[\\/#\\?]?$",
          originalSource: "/",
        },
      ],
      wasm: [],
      assets: [],
      env: {
        __NEXT_BUILD_ID: "1",
        NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "1",
        __NEXT_PREVIEW_MODE_ID: "1",
        __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: "1",
        __NEXT_PREVIEW_MODE_SIGNING_KEY: "1",
      },
    },
  },
  sortedMiddleware: ["/"],
  functions: {},
};

export const middlewareV2ManifestWhenUsed: MiddlewareManifestV2 = {
  sortedMiddleware: ["/"],
  middleware: {
    "/": {
      files: ["server/edge-runtime-webpack.js", "server/middleware.js"],
      name: "middleware",
      page: "/",
      matchers: [
        {
          regexp:
            "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/([^/.]{1,}))\\/about(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?(.json)?[\\/#\\?]?$",
          originalSource: "",
        },
      ],
      wasm: [],
      assets: [],
    },
  },
  functions: {},
  version: 2,
};

export const middlewareV2ManifestWhenNotUsed: MiddlewareManifestV2 = {
  sortedMiddleware: [],
  middleware: {},
  functions: {},
  version: 2,
};

export const middlewareV1ManifestWhenUsed: MiddlewareManifestV1 = {
  sortedMiddleware: ["/"],
  clientInfo: [["/", false]],
  middleware: {
    "/": {
      env: [],
      files: ["server/edge-runtime-webpack.js", "server/pages/_middleware.js"],
      name: "pages/_middleware",
      page: "/",
      regexp: "^/(?!_next).*$",
      wasm: [],
    },
  },
  version: 1,
};

export const middlewareV1ManifestWhenNotUsed: MiddlewareManifestV1 = {
  sortedMiddleware: [],
  clientInfo: [],
  middleware: {},
  version: 1,
};
