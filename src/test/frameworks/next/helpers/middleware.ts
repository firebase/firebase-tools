import type { MiddlewareManifest } from "next/dist/build/webpack/plugins/middleware-plugin";

export const middlewareManifestWhenUsed: MiddlewareManifest = {
  sortedMiddleware: ["/"],
  middleware: {
    "/": {
      env: [],
      files: ["server/edge-runtime-webpack.js", "server/middleware.js"],
      name: "middleware",
      page: "/",
      matchers: [
        {
          regexp:
            "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/([^/.]{1,}))\\/about(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?(.json)?[\\/#\\?]?$",
        },
      ],
      wasm: [],
      assets: [],
    },
  },
  functions: {},
  version: 2,
};

export const middlewareManifestWhenNotUsed: MiddlewareManifest = {
  sortedMiddleware: [],
  middleware: {},
  functions: {},
  version: 2,
};
