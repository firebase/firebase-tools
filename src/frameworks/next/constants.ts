import type {
  APP_PATH_ROUTES_MANIFEST as APP_PATH_ROUTES_MANIFEST_TYPE,
  EXPORT_MARKER as EXPORT_MARKER_TYPE,
  IMAGES_MANIFEST as IMAGES_MANIFEST_TYPE,
  MIDDLEWARE_MANIFEST as MIDDLEWARE_MANIFEST_TYPE,
  PAGES_MANIFEST as PAGES_MANIFEST_TYPE,
  PRERENDER_MANIFEST as PRERENDER_MANIFEST_TYPE,
  ROUTES_MANIFEST as ROUTES_MANIFEST_TYPE,
} from "next/constants";

export const APP_PATH_ROUTES_MANIFEST: typeof APP_PATH_ROUTES_MANIFEST_TYPE =
  "app-path-routes-manifest.json";
export const EXPORT_MARKER: typeof EXPORT_MARKER_TYPE = "export-marker.json";
export const IMAGES_MANIFEST: typeof IMAGES_MANIFEST_TYPE = "images-manifest.json";
export const MIDDLEWARE_MANIFEST: typeof MIDDLEWARE_MANIFEST_TYPE = "middleware-manifest.json";
export const PAGES_MANIFEST: typeof PAGES_MANIFEST_TYPE = "pages-manifest.json";
export const PRERENDER_MANIFEST: typeof PRERENDER_MANIFEST_TYPE = "prerender-manifest.json";
export const ROUTES_MANIFEST: typeof ROUTES_MANIFEST_TYPE = "routes-manifest.json";
