import type { Header, Rewrite, Redirect } from "next/dist/lib/load-custom-routes";

export type RoutesManifestRedirect = Redirect & {
  regex: string;
  internal?: boolean;
};
export type RoutesManifestRedirects = RoutesManifestRedirect[];

export type RoutesManifestRewrite = Rewrite & { regex: string };
export type RoutesManifestRewriteArray = RoutesManifestRewrite[];
export type RoutesManifestRewriteObject = {
  beforeFiles?: RoutesManifestRewrite[];
  afterFiles?: RoutesManifestRewrite[];
  fallback?: RoutesManifestRewrite[];
};

export type RoutesManifestHeader = Header & { regex: string };
export type RoutesManifestHeaders = RoutesManifestHeader[];

// Next.js's exposed interface is incomplete here
// TODO see if there's a better way to grab this
// TODO: rename to RoutesManifest as Next.js has other types of manifests
export interface Manifest {
  distDir?: string;
  basePath?: string;
  headers?: RoutesManifestHeaders;
  redirects?: RoutesManifestRedirects;
  rewrites?: RoutesManifestRewriteArray | RoutesManifestRewriteObject;
}
