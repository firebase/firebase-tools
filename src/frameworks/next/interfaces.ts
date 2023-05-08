import type { RouteHas } from "next/dist/lib/load-custom-routes";
import type { ImageConfigComplete } from "next/dist/shared/lib/image-config";
import type { MiddlewareManifest as MiddlewareManifestV2FromNext } from "next/dist/build/webpack/plugins/middleware-plugin";
import type { HostingHeaders } from "../../firebaseConfig";

export interface RoutesManifestRewriteObject {
  beforeFiles?: RoutesManifestRewrite[];
  afterFiles?: RoutesManifestRewrite[];
  fallback?: RoutesManifestRewrite[];
}

export interface RoutesManifestRedirect {
  source: string;
  destination: string;
  locale?: false;
  internal?: boolean;
  statusCode: number;
  regex: string;
  has?: RouteHas[];
  missing?: RouteHas[];
}

export interface RoutesManifestRewrite {
  source: string;
  destination: string;
  has?: RouteHas[];
  missing?: RouteHas[];
  regex: string;
}

export interface RoutesManifestHeader {
  source: string;
  headers: { key: string; value: string }[];
  has?: RouteHas[];
  missing?: RouteHas[];
  regex: string;
}

// Next.js's exposed interface is incomplete here
export interface RoutesManifest {
  version: number;
  pages404: boolean;
  basePath: string;
  redirects: Array<RoutesManifestRedirect>;
  rewrites?: Array<RoutesManifestRewrite> | RoutesManifestRewriteObject;
  headers: Array<RoutesManifestHeader>;
  staticRoutes: Array<{
    page: string;
    regex: string;
    namedRegex?: string;
    routeKeys?: { [key: string]: string };
  }>;
  dynamicRoutes: Array<{
    page: string;
    regex: string;
    namedRegex?: string;
    routeKeys?: { [key: string]: string };
  }>;
  dataRoutes: Array<{
    page: string;
    routeKeys?: { [key: string]: string };
    dataRouteRegex: string;
    namedDataRouteRegex?: string;
  }>;
  i18n?: {
    domains?: Array<{
      http?: true;
      domain: string;
      locales?: string[];
      defaultLocale: string;
    }>;
    locales: string[];
    defaultLocale: string;
    localeDetection?: false;
  };
}

export interface ExportMarker {
  version: number;
  hasExportPathMap: boolean;
  exportTrailingSlash: boolean;
  isNextImageImported: boolean;
}

export type MiddlewareManifest = MiddlewareManifestV1 | MiddlewareManifestV2FromNext;

export type MiddlewareManifestV2 = MiddlewareManifestV2FromNext;

// See: https://github.com/vercel/next.js/blob/b188fab3360855c28fd9407bd07c4ee9f5de16a6/packages/next/build/webpack/plugins/middleware-plugin.ts#L15-L29
export interface MiddlewareManifestV1 {
  version: 1;
  sortedMiddleware: string[];
  clientInfo: [location: string, isSSR: boolean][];
  middleware: {
    [page: string]: {
      env: string[];
      files: string[];
      name: string;
      page: string;
      regexp: string;
      wasm?: any[]; // WasmBinding isn't exported from next
    };
  };
}

export interface ImagesManifest {
  version: number;
  images: ImageConfigComplete & {
    sizes: number[];
  };
}

export interface NpmLsDepdendency {
  version?: string;
  resolved?: string;
  dependencies?: {
    [key: string]: NpmLsDepdendency;
  };
}

export interface NpmLsReturn {
  version: string;
  name: string;
  dependencies: {
    [key: string]: NpmLsDepdendency;
  };
}

export interface AppPathsManifest {
  [key: string]: string;
}

export interface AppPathRoutesManifest {
  [key: string]: string;
}

export interface HostingHeadersWithSource {
  source: string;
  headers: HostingHeaders["headers"];
}
