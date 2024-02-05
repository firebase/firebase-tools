import { existsSync } from "fs";
import { pathExists } from "fs-extra";
import { basename, extname, join, posix } from "path";
import { readFile } from "fs/promises";
import { sync as globSync } from "glob";
import type { PagesManifest } from "next/dist/build/webpack/plugins/pages-manifest-plugin";
import { coerce } from "semver";

import { findDependency, isUrl, readJSON } from "../utils";
import type {
  RoutesManifest,
  ExportMarker,
  ImagesManifest,
  NpmLsDepdendency,
  RoutesManifestRewrite,
  RoutesManifestRedirect,
  RoutesManifestHeader,
  MiddlewareManifest,
  MiddlewareManifestV1,
  MiddlewareManifestV2,
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

export const I18N_SOURCE = /\/:nextInternalLocale(\([^\)]+\))?/;

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
 * Remove Next.js internal i18n prefix from headers, redirects and rewrites.
 */
export function cleanCustomRouteI18n(path: string): string {
  return path.replace(I18N_SOURCE, "");
}

export function cleanI18n<T = any>(it: T & { source: string; [key: string]: any }): T {
  const [, localesRegex] = it.source.match(I18N_SOURCE) || [undefined, undefined];
  const source = localesRegex ? cleanCustomRouteI18n(it.source) : it.source;
  const destination =
    "destination" in it && localesRegex ? cleanCustomRouteI18n(it.destination) : it.destination;
  const regex =
    "regex" in it && localesRegex ? it.regex.replace(`(?:/${localesRegex})`, "") : it.regex;
  return {
    ...it,
    source,
    destination,
    regex,
  };
}

/**
 * Whether a Next.js rewrite is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#rewrites
 *
 * Next.js unsupported rewrites includes:
 * - Rewrites with the `has` or `missing` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/rewrites#header-cookie-and-query-matching
 *
 * - Rewrites to external URLs or URLs using parameters
 */
export function isRewriteSupportedByHosting(rewrite: RoutesManifestRewrite): boolean {
  return !(
    "has" in rewrite ||
    "missing" in rewrite ||
    isUrl(rewrite.destination) ||
    rewrite.destination.includes("?")
  );
}

/**
 * Whether a Next.js redirect is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#redirects
 *
 * Next.js unsupported redirects includes:
 * - Redirects with the `has` or `missing` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/redirects#header-cookie-and-query-matching
 *
 * - Next.js internal redirects
 */
export function isRedirectSupportedByHosting(redirect: RoutesManifestRedirect): boolean {
  return !(
    "has" in redirect ||
    "missing" in redirect ||
    "internal" in redirect ||
    redirect.destination.includes("?")
  );
}

/**
 * Whether a Next.js custom header is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#headers
 *
 * Next.js unsupported headers includes:
 * - Custom header with the `has` or `missing` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/headers#header-cookie-and-query-matching
 *
 */
export function isHeaderSupportedByHosting(header: RoutesManifestHeader): boolean {
  return !("has" in header || "missing" in header);
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
  nextJsRewrites: RoutesManifest["rewrites"],
): RoutesManifestRewrite[] {
  if (Array.isArray(nextJsRewrites)) {
    return nextJsRewrites.map(cleanI18n);
  }

  if (nextJsRewrites?.beforeFiles) {
    return nextJsRewrites.beforeFiles.map(cleanI18n);
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
      join(dir, "server", MIDDLEWARE_MANIFEST),
    );

    return Object.keys(middlewareManifest.middleware).length > 0;
  }
}

/**
 * Whether image optimization is being used
 *
 * @param projectDir path to the project directory
 * @param distDir path to `distDir` - where the manifests are located
 */
export async function isUsingImageOptimization(
  projectDir: string,
  distDir: string,
): Promise<boolean> {
  let isNextImageImported = await usesNextImage(projectDir, distDir);

  // App directory doesn't use the export marker, look it up manually
  if (!isNextImageImported && isUsingAppDirectory(join(projectDir, distDir))) {
    if (await isUsingNextImageInAppDirectory(projectDir, distDir)) {
      isNextImageImported = true;
    }
  }

  if (isNextImageImported) {
    const imagesManifest = await readJSON<ImagesManifest>(
      join(projectDir, distDir, IMAGES_MANIFEST),
    );
    return !imagesManifest.images.unoptimized;
  }

  return false;
}

/**
 * Whether next/image is being used in the app directory
 */
export async function isUsingNextImageInAppDirectory(
  projectDir: string,
  nextDir: string,
): Promise<boolean> {
  const files = globSync(
    join(projectDir, nextDir, "server", "**", "*client-reference-manifest.js"),
  );

  for (const filepath of files) {
    const fileContents = await readFile(filepath);

    // Return true when the first file containing the next/image component is found
    if (fileContents.includes("node_modules/next/dist/client/image")) {
      return true;
    }
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
    [] as string[],
  );
  return dependencyNames;
}

/**
 * Get regexes from middleware matcher manifest
 */
export function getMiddlewareMatcherRegexes(middlewareManifest: MiddlewareManifest): RegExp[] {
  const middlewareObjectValues = Object.values(middlewareManifest.middleware);

  let middlewareMatchers: Record<"regexp", string>[];

  if (middlewareManifest.version === 1) {
    middlewareMatchers = middlewareObjectValues.map(
      (page: MiddlewareManifestV1["middleware"]["page"]) => ({ regexp: page.regexp }),
    );
  } else {
    middlewareMatchers = middlewareObjectValues
      .map((page: MiddlewareManifestV2["middleware"]["page"]) => page.matchers)
      .flat();
  }

  return middlewareMatchers.map((matcher) => new RegExp(matcher.regexp));
}

/**
 * Get non static routes based on pages-manifest, prerendered and dynamic routes
 */
export function getNonStaticRoutes(
  pagesManifestJSON: PagesManifest,
  prerenderedRoutes: string[],
  dynamicRoutes: string[],
): string[] {
  const nonStaticRoutes = Object.entries(pagesManifestJSON)
    .filter(
      ([it, src]) =>
        !(
          extname(src) !== ".js" ||
          ["/_app", "/_error", "/_document"].includes(it) ||
          prerenderedRoutes.includes(it) ||
          dynamicRoutes.includes(it)
        ),
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
  dynamicRoutes: string[],
): Set<string> {
  const nonStaticServerComponents = Object.entries(appPathsManifest)
    .filter(([it, src]) => {
      if (extname(src) !== ".js") return;
      const path = appPathRoutesManifest[it];
      return !(prerenderedRoutes.includes(path) || dynamicRoutes.includes(path));
    })
    .map(([it]) => it);

  return new Set(nonStaticServerComponents);
}

/**
 * Get headers from .meta files
 */
export async function getHeadersFromMetaFiles(
  sourceDir: string,
  distDir: string,
  basePath: string,
  appPathRoutesManifest: AppPathRoutesManifest,
): Promise<HostingHeadersWithSource[]> {
  const headers: HostingHeadersWithSource[] = [];

  await Promise.all(
    Object.entries(appPathRoutesManifest).map(async ([key, source]) => {
      if (!["route", "page"].includes(basename(key))) return;
      const parts = source.split("/").filter((it) => !!it);
      const partsOrIndex = parts.length > 0 ? parts : ["index"];

      const routePath = join(sourceDir, distDir, "server", "app", ...partsOrIndex);
      const metadataPath = `${routePath}.meta`;

      if (dirExistsSync(routePath) && fileExistsSync(metadataPath)) {
        const meta = await readJSON<{ headers?: Record<string, string> }>(metadataPath);
        if (meta.headers)
          headers.push({
            source: posix.join(basePath, source),
            headers: Object.entries(meta.headers).map(([key, value]) => ({ key, value })),
          });
      }
    }),
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

/**
 * Get Next.js version in the following format: `major.minor.patch`, ignoring
 * canary versions as it causes issues with semver comparisons.
 */
export function getNextVersion(cwd: string): string | undefined {
  const dependency = findDependency("next", { cwd, depth: 0, omitDev: false });
  if (!dependency) return undefined;

  const nextVersionSemver = coerce(dependency.version);
  if (!nextVersionSemver) return dependency.version;

  return nextVersionSemver.toString();
}

/**
 * Whether the Next.js project has a static `not-found` page in the app directory.
 *
 * The Next.js build manifests are misleading regarding the existence of a static
 * `not-found` component. Therefore, we check if a `_not-found.html` file exists
 * in the generated app directory files to know whether `not-found` is static.
 */
export async function hasStaticAppNotFoundComponent(
  sourceDir: string,
  distDir: string,
): Promise<boolean> {
  return pathExists(join(sourceDir, distDir, "server", "app", "_not-found.html"));
}
