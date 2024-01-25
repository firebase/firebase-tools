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

export const ESBUILD_VERSION = "0.19.2";

// TODO: Get these constants from Next.js after bumping dependency
export const RSC_HEADER = "RSC" as const;
export const NEXT_ROUTER_STATE_TREE = "Next-Router-State-Tree" as const;
export const NEXT_ROUTER_PREFETCH_HEADER = "Next-Router-Prefetch" as const;
export const NEXT_URL = "Next-Url" as const;
export const RSC_VARY_HEADER =
  `${RSC_HEADER}, ${NEXT_ROUTER_STATE_TREE}, ${NEXT_ROUTER_PREFETCH_HEADER}, ${NEXT_URL}` as const;
export const NEXT_DID_POSTPONE_HEADER = "x-nextjs-postponed" as const;
export const RSC_SUFFIX = ".rsc";
export const RSC_PREFETCH_SUFFIX = ".prefetch.rsc";
export const RSC_CONTENT_TYPE_HEADER = "text/x-component" as const;
