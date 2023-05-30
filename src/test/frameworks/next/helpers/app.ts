import { PrerenderManifest } from "next/dist/build";
import type { PagesManifest } from "next/dist/build/webpack/plugins/pages-manifest-plugin";
import type {
  AppPathRoutesManifest,
  AppPathsManifest,
} from "../../../../frameworks/next/interfaces";

export const appPathsManifest: AppPathsManifest = {
  "/api/test/route": "app/api/test/route.js",
  "/api/static/route": "app/api/static/route.js",
  "/page": "app/page.js",
};

export const appPathRoutesManifest: AppPathRoutesManifest = {
  "/api/test/route": "/api/test",
  "/api/static/route": "/api/static",
  "/page": "/",
};

export const pagesManifest: PagesManifest = {
  "/_app": "pages/_app.js",
  "/_document": "pages/_document.js",
  "/_error": "pages/_error.js",
  "/404": "pages/404.html",
  "/dynamic/[dynamic-slug]": "pages/dynamic/[dynamic-slug].js",
};

export const prerenderManifest: PrerenderManifest = {
  version: 3,
  routes: {
    "/": { initialRevalidateSeconds: false, srcRoute: "/", dataRoute: "/index.rsc" },
    "/api/static": {
      initialRevalidateSeconds: false,
      srcRoute: "/api/static",
      dataRoute: "null",
    },
  },
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview: {
    previewModeId: "123",
    previewModeSigningKey: "123",
    previewModeEncryptionKey: "123",
  },
};

// content of a .meta file
export const metaFileContents = {
  status: 200,
  headers: { "content-type": "application/json", "custom-header": "custom-value" },
} as const;
