import type { MiddlewareManifestV1, MiddlewareManifestV2 } from "../interfaces";

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
