import { existsSync } from "fs";
import { pathExists } from "fs-extra";
import { basename, extname, join } from "path";
import type { Header, Redirect, Rewrite } from "next/dist/lib/load-custom-routes";
import type { MiddlewareManifest } from "next/dist/build/webpack/plugins/middleware-plugin";
import type { PagesManifest } from "next/dist/build/webpack/plugins/pages-manifest-plugin";

import { isUrl, readJSON } from "../utils";
import type {
  Manifest,
  RoutesManifestRewrite,
  ExportMarker,
  ImagesManifest,
  NpmLsDepdendency,
  AppPathsManifest,
  AppPathRoutesManifest,
  HostingHeadersWithSource,
} from "./interfaces";
import {
  APP_PATH_ROUTES_MANIFEST,
  EXPORT_MARKER,
  IMAGES_MANIFEST,
  MIDDLEWARE_MANIFEST,
} from "./constants";
import { dirExistsSync, fileExistsSync } from "../../fsutils";
import { readFile } from "fs/promises";

/**
 * Whether the given path has a regex or not.
 * According to the Next.js documentation:
 * ```md
 *  To match a regex path you can wrap the regex in parentheses
 *  after a parameter, for example /post/:slug(\\d{1,}) will match /post/123
 *  but not /post/abc.
 * ```
 * See: https://nextjs.org/docs/api-reference/next.config.js/redirects#regex-path-matching
 */
export function pathHasRegex(path: string): boolean {
  // finds parentheses that are not preceded by double backslashes
  return /(?<!\\)\(/.test(path);
}

/**
 * Remove escaping from characters used for Regex patch matching that Next.js
 * requires. As Firebase Hosting does not require escaping for those charachters,
 * we remove them.
 *
 * According to the Next.js documentation:
 * ```md
 * The following characters (, ), {, }, :, *, +, ? are used for regex path
 * matching, so when used in the source as non-special values they must be
 * escaped by adding \\ before them.
 * ```
 *
 * See: https://nextjs.org/docs/api-reference/next.config.js/rewrites#regex-path-matching
 */
export function cleanEscapedChars(path: string): string {
  return path.replace(/\\([(){}:+?*])/g, (a, b: string) => b);
}

/**
 * Whether a Next.js rewrite is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#rewrites
 *
 * Next.js unsupported rewrites includes:
 * - Rewrites with the `has` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/rewrites#header-cookie-and-query-matching
 *
 * - Rewrites using regex for path matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/rewrites#regex-path-matching
 *
 * - Rewrites to external URLs
 */
export function isRewriteSupportedByHosting(rewrite: Rewrite): boolean {
  return !("has" in rewrite || pathHasRegex(rewrite.source) || isUrl(rewrite.destination));
}

/**
 * Whether a Next.js redirect is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#redirects
 *
 * Next.js unsupported redirects includes:
 * - Redirects with the `has` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/redirects#header-cookie-and-query-matching
 *
 * - Redirects using regex for path matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/redirects#regex-path-matching
 *
 * - Next.js internal redirects
 */
export function isRedirectSupportedByHosting(redirect: Redirect): boolean {
  return !("has" in redirect || pathHasRegex(redirect.source) || "internal" in redirect);
}

/**
 * Whether a Next.js custom header is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#headers
 *
 * Next.js unsupported headers includes:
 * - Custom header with the `has` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/headers#header-cookie-and-query-matching
 *
 * - Custom header using regex for path matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/headers#regex-path-matching
 */
export function isHeaderSupportedByHosting(header: Header): boolean {
  return !("has" in header || pathHasRegex(header.source));
}

/**
 * Get which Next.js rewrites will be used before checking supported items individually.
 *
 * Next.js rewrites can be arrays or objects:
 * - For arrays, all supported items can be used.
 * - For objects only `beforeFiles` can be used.
 *
 * See: https://nextjs.org/docs/api-reference/next.config.js/rewrites
 */
export function getNextjsRewritesToUse(
  nextJsRewrites: Manifest["rewrites"]
): RoutesManifestRewrite[] {
  if (Array.isArray(nextJsRewrites)) {
    return nextJsRewrites;
  }

  if (nextJsRewrites?.beforeFiles) {
    return nextJsRewrites.beforeFiles;
  }

  return [];
}

/**
 * Check if `/app` directory is used in the Next.js project.
 * @param sourceDir location of the source directory
 * @return true if app directory is used in the Next.js project
 */
export function usesAppDirRouter(sourceDir: string): boolean {
  const appPathRoutesManifestPath = join(sourceDir, APP_PATH_ROUTES_MANIFEST);
  return existsSync(appPathRoutesManifestPath);
}
/**
 * Check if the project is using the next/image component based on the export-marker.json file.
 * @param sourceDir location of the source directory
 * @return true if the Next.js project uses the next/image component
 */
export async function usesNextImage(sourceDir: string, distDir: string): Promise<boolean> {
  const exportMarker = await readJSON<ExportMarker>(join(sourceDir, distDir, EXPORT_MARKER));
  return exportMarker.isNextImageImported;
}

/**
 * Check if Next.js is forced to serve the source image as-is instead of being oprimized
 * by setting `unoptimized: true` in next.config.js.
 * https://nextjs.org/docs/api-reference/next/image#unoptimized
 *
 * @param sourceDir location of the source directory
 * @param distDir location of the dist directory
 * @return true if image optimization is disabled
 */
export async function hasUnoptimizedImage(sourceDir: string, distDir: string): Promise<boolean> {
  const imagesManifest = await readJSON<ImagesManifest>(join(sourceDir, distDir, IMAGES_MANIFEST));
  return imagesManifest.images.unoptimized;
}

/**
 * Whether Next.js middleware is being used
 *
 * @param dir in development must be the project root path, otherwise `distDir`
 * @param isDevMode whether the project is running on dev or production
 */
export async function isUsingMiddleware(dir: string, isDevMode: boolean): Promise<boolean> {
  if (isDevMode) {
    const [middlewareJs, middlewareTs] = await Promise.all([
      pathExists(join(dir, "middleware.js")),
      pathExists(join(dir, "middleware.ts")),
    ]);

    return middlewareJs || middlewareTs;
  } else {
    const middlewareManifest: MiddlewareManifest = await readJSON<MiddlewareManifest>(
      join(dir, "server", MIDDLEWARE_MANIFEST)
    );

    return Object.keys(middlewareManifest.middleware).length > 0;
  }
}

/**
 * Whether image optimization is being used
 *
 * @param dir path to `distDir` - where the manifests are located
 */
export async function isUsingImageOptimization(dir: string): Promise<boolean> {
  let { isNextImageImported } = await readJSON<ExportMarker>(join(dir, EXPORT_MARKER));
  // App directory doesn't use the export marker, look it up manually
  if (!isNextImageImported && isUsingAppDirectory(dir)) {
    isNextImageImported = (await readFile(join(dir, "server", "client-reference-manifest.js")))
      .toString()
      .includes("node_modules/next/dist/client/image.js");
  }

  if (isNextImageImported) {
    const imagesManifest = await readJSON<ImagesManifest>(join(dir, IMAGES_MANIFEST));
    return !imagesManifest.images.unoptimized;
  }

  return false;
}

/**
 * Whether Next.js app directory is being used
 *
 * @param dir path to `distDir` - where the manifests are located
 */
export function isUsingAppDirectory(dir: string): boolean {
  const appPathRoutesManifestPath = join(dir, APP_PATH_ROUTES_MANIFEST);

  return fileExistsSync(appPathRoutesManifestPath);
}

/**
 * Given input from `npm ls` flatten the dependency tree and return all module names
 *
 * @param dependencies returned from `npm ls`
 */
export function allDependencyNames(mod: NpmLsDepdendency): string[] {
  if (!mod.dependencies) return [];
  const dependencyNames = Object.keys(mod.dependencies).reduce(
    (acc, it) => [...acc, it, ...allDependencyNames(mod.dependencies![it])],
    [] as string[]
  );
  return dependencyNames;
}

/**
 * Get non static routes based on pages-manifest, prerendered and dynamic routes
 */
export function getNonStaticRoutes(
  pagesManifestJSON: PagesManifest,
  prerenderedRoutes: string[],
  dynamicRoutes: string[]
): string[] {
  const nonStaticRoutes = Object.entries(pagesManifestJSON)
    .filter(
      ([it, src]) =>
        !(
          extname(src) !== ".js" ||
          ["/_app", "/_error", "/_document"].includes(it) ||
          prerenderedRoutes.includes(it) ||
          dynamicRoutes.includes(it)
        )
    )
    .map(([it]) => it);

  return nonStaticRoutes;
}

/**
 * Get non static components from app directory
 */
export function getNonStaticServerComponents(
  appPathsManifest: AppPathsManifest,
  appPathRoutesManifest: AppPathRoutesManifest,
  prerenderedRoutes: string[],
  dynamicRoutes: string[]
): string[] {
  const nonStaticServerComponents = Object.entries(appPathsManifest)
    .filter(([it, src]) => {
      if (extname(src) !== ".js") return;
      const path = appPathRoutesManifest[it];
      return !(prerenderedRoutes.includes(path) || dynamicRoutes.includes(path));
    })
    .map(([it]) => it);

  return nonStaticServerComponents;
}

/**
 * Get headers from .meta files
 */
export async function getHeadersFromMetaFiles(
  sourceDir: string,
  distDir: string,
  appPathRoutesManifest: AppPathRoutesManifest
): Promise<HostingHeadersWithSource[]> {
  const headers: HostingHeadersWithSource[] = [];

  await Promise.all(
    Object.entries(appPathRoutesManifest).map(async ([key, source]) => {
      if (basename(key) !== "route") return;
      const parts = source.split("/").filter((it) => !!it);
      const partsOrIndex = parts.length > 0 ? parts : ["index"];

      const routePath = join(sourceDir, distDir, "server", "app", ...partsOrIndex);
      const metadataPath = `${routePath}.meta`;

      if (dirExistsSync(routePath) && fileExistsSync(metadataPath)) {
        const meta = await readJSON<{ headers?: Record<string, string> }>(metadataPath);
        if (meta.headers)
          headers.push({
            source,
            headers: Object.entries(meta.headers).map(([key, value]) => ({ key, value })),
          });
      }
    })
  );

  return headers;
}

/**
 * Get build id from .next/BUILD_ID file
 * @throws if file doesn't exist
 */
export async function getBuildId(distDir: string): Promise<string> {
  const buildId = await readFile(join(distDir, "BUILD_ID"));

  return buildId.toString();
}
