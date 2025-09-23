import { PrerenderManifest } from "next/dist/build";
import type { PagesManifest } from "next/dist/build/webpack/plugins/pages-manifest-plugin";
import type { ActionManifest, AppPathRoutesManifest, AppPathsManifest } from "../interfaces";

export const appPathsManifest: AppPathsManifest = {
  "/api/test/route": "app/api/test/route.js",
  "/api/static/route": "app/api/static/route.js",
  "/page": "app/page.js",
};

export const appPathRoutesManifest: AppPathRoutesManifest = {
  "/api/test/route": "/api/test",
  "/api/static/route": "/api/static",
  "/page": "/",
  "/another-s-a/page": "/another-s-a",
  "/server-action/page": "/server-action",
  "/ssr/page": "/ssr",
  "/server-action/edge/page": "/server-action/edge",
  "/ppr/page": "/ppr",
};

export const pagesManifest: PagesManifest = {
  "/_app": "pages/_app.js",
  "/_document": "pages/_document.js",
  "/_error": "pages/_error.js",
  "/404": "pages/404.html",
  "/dynamic/[dynamic-slug]": "pages/dynamic/[dynamic-slug].js",
};

export const prerenderManifest: PrerenderManifest = {
  version: 4,
  routes: {
    "/": {
      initialRevalidateSeconds: false,
      srcRoute: "/",
      dataRoute: "/index.rsc",
      experimentalPPR: false,
      prefetchDataRoute: "",
    },
    "/api/static": {
      initialRevalidateSeconds: false,
      srcRoute: "/api/static",
      dataRoute: "",
      experimentalPPR: false,
      prefetchDataRoute: "",
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

export const pageClientReferenceManifestWithImage = `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/page"] =
  '{"ssrModuleMapping":{"372":{"*":{"id":"772","name":"*","chunks":[],"async":false}},"1223":{"*":{"id":"4249","name":"*","chunks":[],"async":false}},"3240":{"*":{"id":"7230","name":"*","chunks":[],"async":false}},"3466":{"*":{"id":"885","name":"*","chunks":[],"async":false}},"5721":{"*":{"id":"8262","name":"*","chunks":[],"async":false}},"8095":{"*":{"id":"4564","name":"*","chunks":[],"async":false}}},"edgeSSRModuleMapping":{},"clientModules":{"/app-path/node_modules/next/dist/client/components/error-boundary.js":{"id":1223,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/error-boundary.js":{"id":1223,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/app-router.js":{"id":8095,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/app-router.js":{"id":8095,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/layout-router.js":{"id":3466,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/layout-router.js":{"id":3466,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/render-from-template-context.js":{"id":372,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/render-from-template-context.js":{"id":372,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/static-generation-searchparams-bailout-provider.js":{"id":5721,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/static-generation-searchparams-bailout-provider.js":{"id":5721,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/image-component.js":{"id":3240,"name":"*","chunks":["931:static/chunks/app/page-63aef8294f0aa02c.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/image-component.js":{"id":3240,"name":"*","chunks":["931:static/chunks/app/page-63aef8294f0aa02c.js"],"async":false},"/app-path/node_modules/next/font/google/target.css?{\\"path\\":\\"src/app/layout.tsx\\",\\"import\\":\\"Inter\\",\\"arguments\\":[{\\"subsets\\":[\\"latin\\"]}],\\"variableName\\":\\"inter\\"}":{"id":794,"name":"*","chunks":["185:static/chunks/app/layout-1a019a4780e5374b.js"],"async":false},"/app-path/src/app/globals.css":{"id":54,"name":"*","chunks":["185:static/chunks/app/layout-1a019a4780e5374b.js"],"async":false}},"entryCSSFiles":{"/app-path/src/app/page":[],"/app-path/src/app/layout":["static/css/decca5dbb1efb27a.css"]}}';`;

export const pageClientReferenceManifestWithoutImage = `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/page"] =
  '{"ssrModuleMapping":{"372":{"*":{"id":"772","name":"*","chunks":[],"async":false}},"1223":{"*":{"id":"4249","name":"*","chunks":[],"async":false}},"3240":{"*":{"id":"7230","name":"*","chunks":[],"async":false}},"3466":{"*":{"id":"885","name":"*","chunks":[],"async":false}},"5721":{"*":{"id":"8262","name":"*","chunks":[],"async":false}},"8095":{"*":{"id":"4564","name":"*","chunks":[],"async":false}}},"edgeSSRModuleMapping":{},"clientModules":{"/app-path/node_modules/next/dist/client/components/error-boundary.js":{"id":1223,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/error-boundary.js":{"id":1223,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/app-router.js":{"id":8095,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/app-router.js":{"id":8095,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/layout-router.js":{"id":3466,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/layout-router.js":{"id":3466,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/render-from-template-context.js":{"id":372,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/render-from-template-context.js":{"id":372,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/client/components/static-generation-searchparams-bailout-provider.js":{"id":5721,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/static-generation-searchparams-bailout-provider.js":{"id":5721,"name":"*","chunks":["272:static/chunks/webpack-524fad5a962db320.js","253:static/chunks/bce60fc1-3138fc63e84359d9.js","961:static/chunks/961-8f7137d989a0e4e3.js"],"async":false},"/app-path/node_modules/next/font/google/target.css?{\\"path\\":\\"src/app/layout.tsx\\",\\"import\\":\\"Inter\\",\\"arguments\\":[{\\"subsets\\":[\\"latin\\"]}],\\"variableName\\":\\"inter\\"}":{"id":794,"name":"*","chunks":["185:static/chunks/app/layout-1a019a4780e5374b.js"],"async":false},"/app-path/src/app/globals.css":{"id":54,"name":"*","chunks":["185:static/chunks/app/layout-1a019a4780e5374b.js"],"async":false}},"entryCSSFiles":{"/app-path/src/app/page":[],"/app-path/src/app/layout":["static/css/decca5dbb1efb27a.css"]}}';`;

export const clientReferenceManifestWithImage = `{"ssrModuleMapping":{"2306":{"*":{"id":"7833","name":"*","chunks":[],"async":false}},"2353":{"*":{"id":"8709","name":"*","chunks":[],"async":false}},"3029":{"*":{"id":"9556","name":"*","chunks":[],"async":false}},"7330":{"*":{"id":"7734","name":"*","chunks":[],"async":false}},"8531":{"*":{"id":"9150","name":"*","chunks":[],"async":false}},"9180":{"*":{"id":"2698","name":"*","chunks":[],"async":false}}},"edgeSSRModuleMapping":{},"clientModules":{"/app-path/node_modules/next/dist/client/components/app-router.js":{"id":2353,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/app-router.js":{"id":2353,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/layout-router.js":{"id":9180,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/layout-router.js":{"id":9180,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/render-from-template-context.js":{"id":2306,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/render-from-template-context.js":{"id":2306,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/static-generation-searchparams-bailout-provider.js":{"id":8531,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/static-generation-searchparams-bailout-provider.js":{"id":8531,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/error-boundary.js":{"id":7330,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/error-boundary.js":{"id":7330,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/image-component.js":{"id":3029,"name":"*","chunks":["931:static/chunks/app/page-8d47763b987bba19.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/image-component.js":{"id":3029,"name":"*","chunks":["931:static/chunks/app/page-8d47763b987bba19.js"],"async":false},"/app-path/node_modules/next/font/google/target.css?{\"path\":\"src/app/layout.tsx\",\"import\":\"Inter\",\"arguments\":[{\"subsets\":[\"latin\"]}],\"variableName\":\"inter\"}":{"id":670,"name":"*","chunks":["185:static/chunks/app/layout-09ef1f5c8b0e56d1.js"],"async":false},"/app-path/src/app/globals.css":{"id":8410,"name":"*","chunks":["185:static/chunks/app/layout-09ef1f5c8b0e56d1.js"],"async":false}},"entryCSSFiles":{"/app-path/src/app/page":[],"/app-path/src/app/layout":["static/css/110a35ea7c81b899.css"]}}`;

export const clientReferenceManifestWithoutImage = `{"ssrModuleMapping":{"2306":{"*":{"id":"7833","name":"*","chunks":[],"async":false}},"2353":{"*":{"id":"8709","name":"*","chunks":[],"async":false}},"3029":{"*":{"id":"9556","name":"*","chunks":[],"async":false}},"7330":{"*":{"id":"7734","name":"*","chunks":[],"async":false}},"8531":{"*":{"id":"9150","name":"*","chunks":[],"async":false}},"9180":{"*":{"id":"2698","name":"*","chunks":[],"async":false}}},"edgeSSRModuleMapping":{},"clientModules":{"/app-path/node_modules/next/dist/client/components/app-router.js":{"id":2353,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/app-router.js":{"id":2353,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/layout-router.js":{"id":9180,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/layout-router.js":{"id":9180,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/render-from-template-context.js":{"id":2306,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/render-from-template-context.js":{"id":2306,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/static-generation-searchparams-bailout-provider.js":{"id":8531,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/static-generation-searchparams-bailout-provider.js":{"id":8531,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/client/components/error-boundary.js":{"id":7330,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/dist/esm/client/components/error-boundary.js":{"id":7330,"name":"*","chunks":["272:static/chunks/webpack-76fd8b39fe914c29.js","253:static/chunks/bce60fc1-8c4748991edb1ec4.js","698:static/chunks/698-1321e6d13d35448d.js"],"async":false},"/app-path/node_modules/next/font/google/target.css?{\"path\":\"src/app/layout.tsx\",\"import\":\"Inter\",\"arguments\":[{\"subsets\":[\"latin\"]}],\"variableName\":\"inter\"}":{"id":670,"name":"*","chunks":["185:static/chunks/app/layout-09ef1f5c8b0e56d1.js"],"async":false},"/app-path/src/app/globals.css":{"id":8410,"name":"*","chunks":["185:static/chunks/app/layout-09ef1f5c8b0e56d1.js"],"async":false}},"entryCSSFiles":{"/app-path/src/app/page":[],"/app-path/src/app/layout":["static/css/110a35ea7c81b899.css"]}}`;

export const serverReferenceManifest: ActionManifest = {
  node: {
    "123": {
      workers: { "app/another-s-a/page": 123, "app/server-action/page": 123 },
      layer: {
        "app/another-s-a/page": "action-browser",
        "app/server-action/page": "action-browser",
        "app/ssr/page": "rsc",
      },
    },
  },
  edge: {
    "123": {
      workers: { "app/server-action/edge/page": 123 },
      layer: { "app/server-action/edge/page": "action-browser" },
    },
  },
  encryptionKey: "456",
};
