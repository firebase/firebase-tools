import type { Header, Rewrite, Redirect } from "next/dist/lib/load-custom-routes";

export interface RoutesManifestRewrite extends Rewrite {
  regex: string;
}

export interface RoutesManifestRewriteObject {
  beforeFiles?: RoutesManifestRewrite[];
  afterFiles?: RoutesManifestRewrite[];
  fallback?: RoutesManifestRewrite[];
}

export interface RoutesManifestHeader extends Header {
  regex: string;
}

// Next.js's exposed interface is incomplete here
// TODO see if there's a better way to grab this
// TODO: rename to RoutesManifest as Next.js has other types of manifests
export interface Manifest {
  distDir?: string;
  basePath?: string;
  headers?: RoutesManifestHeader[];
  redirects?: Array<
    Redirect & {
      regex: string;
      internal?: boolean;
    }
  >;
  rewrites?: RoutesManifestRewrite[] | RoutesManifestRewriteObject;
}
