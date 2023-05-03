import { execSync } from "child_process";
import { spawn, sync as spawnSync } from "cross-spawn";
import { mkdir, copyFile } from "fs/promises";
import { basename, dirname, join } from "path";
import type { NextConfig } from "next";
import type { PrerenderManifest } from "next/dist/build";
import type { MiddlewareManifest } from "next/dist/build/webpack/plugins/middleware-plugin";
import type { PagesManifest } from "next/dist/build/webpack/plugins/pages-manifest-plugin";
import type { NextServer } from "next/dist/server/next";
import { copy, mkdirp, pathExists, pathExistsSync } from "fs-extra";
import { pathToFileURL, parse } from "url";
import { existsSync } from "fs";
import { gte } from "semver";
import { IncomingMessage, ServerResponse } from "http";
import * as clc from "colorette";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/Pick";
import { streamObject } from "stream-json/streamers/StreamObject";
import { fileExistsSync, dirExistsSync } from "../../fsutils";

import { BuildResult, FrameworkType, SupportLevel } from "../interfaces";
import { promptOnce } from "../../prompt";
import { FirebaseError } from "../../error";
import {
  cleanEscapedChars,
  getNextjsRewritesToUse,
  isHeaderSupportedByHosting,
  isRedirectSupportedByHosting,
  isRewriteSupportedByHosting,
  isUsingImageOptimization,
  isUsingMiddleware,
  allDependencyNames,
  getNonStaticRoutes,
  getNonStaticServerComponents,
  getHeadersFromMetaFiles,
} from "./utils";
import { NODE_VERSION, NPM_COMMAND_TIMEOUT_MILLIES } from "../constants";
import type {
  AppPathRoutesManifest,
  AppPathsManifest,
  HostingHeadersWithSource,
  Manifest,
  NpmLsDepdendency,
} from "./interfaces";
import {
  readJSON,
  simpleProxy,
  warnIfCustomBuildScript,
  relativeRequire,
  findDependency,
} from "../utils";
import type { EmulatorInfo } from "../../emulator/types";
import { usesAppDirRouter, usesNextImage, hasUnoptimizedImage } from "./utils";
import {
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  APP_PATHS_MANIFEST,
} from "./constants";

const DEFAULT_BUILD_SCRIPT = ["next build"];
const PUBLIC_DIR = "public";

export const name = "Next.js";
export const support = SupportLevel.Preview;
export const type = FrameworkType.MetaFramework;
export const docsUrl = "https://firebase.google.com/docs/hosting/frameworks/nextjs";

const DEFAULT_NUMBER_OF_REASONS_TO_LIST = 5;

function getNextVersion(cwd: string): string | undefined {
  return findDependency("next", { cwd, depth: 0, omitDev: false })?.version;
}

function getReactVersion(cwd: string): string | undefined {
  return findDependency("react-dom", { cwd, omitDev: false })?.version;
}

/**
 * Returns whether this codebase is a Next.js backend.
 */
export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;
  if (!(await pathExists("next.config.js")) && !getNextVersion(dir)) return;

  return { mayWantBackend: true, publicDirectory: join(dir, PUBLIC_DIR) };
}

/**
 * Build a next.js application.
 */
export async function build(dir: string): Promise<BuildResult> {
  const { default: nextBuild } = relativeRequire(dir, "next/dist/build");

  await warnIfCustomBuildScript(dir, name, DEFAULT_BUILD_SCRIPT);

  const reactVersion = getReactVersion(dir);
  if (reactVersion && gte(reactVersion, "18.0.0")) {
    // This needs to be set for Next build to succeed with React 18
    process.env.__NEXT_REACT_ROOT = "true";
  }

  await nextBuild(dir, null, false, false, true).catch((e) => {
    // Err on the side of displaying this error, since this is likely a bug in
    // the developer's code that we want to display immediately
    console.error(e.message);
    throw e;
  });

  const reasonsForBackend = new Set();
  const { distDir, trailingSlash } = await getConfig(dir);

  if (await isUsingMiddleware(join(dir, distDir), false)) {
    reasonsForBackend.add("middleware");
  }

  if (await isUsingImageOptimization(join(dir, distDir))) {
    reasonsForBackend.add(`Image Optimization`);
  }

  const prerenderManifest = await readJSON<PrerenderManifest>(
    join(dir, distDir, PRERENDER_MANIFEST)
  );

  const dynamicRoutesWithFallback = Object.entries(prerenderManifest.dynamicRoutes || {}).filter(
    ([, it]) => it.fallback !== false
  );
  if (dynamicRoutesWithFallback.length > 0) {
    for (const [key] of dynamicRoutesWithFallback) {
      reasonsForBackend.add(`use of fallback ${key}`);
    }
  }

  const routesWithRevalidate = Object.entries(prerenderManifest.routes).filter(
    ([, it]) => it.initialRevalidateSeconds
  );
  if (routesWithRevalidate.length > 0) {
    for (const [, { srcRoute }] of routesWithRevalidate) {
      reasonsForBackend.add(`use of revalidate ${srcRoute}`);
    }
  }

  const pagesManifestJSON = await readJSON<PagesManifest>(
    join(dir, distDir, "server", PAGES_MANIFEST)
  );
  const prerenderedRoutes = Object.keys(prerenderManifest.routes);
  const dynamicRoutes = Object.keys(prerenderManifest.dynamicRoutes);

  const unrenderedPages = getNonStaticRoutes(pagesManifestJSON, prerenderedRoutes, dynamicRoutes);

  for (const key of unrenderedPages) {
    reasonsForBackend.add(`non-static route ${key}`);
  }

  const manifest = await readJSON<Manifest>(join(dir, distDir, ROUTES_MANIFEST));

  const {
    headers: nextJsHeaders = [],
    redirects: nextJsRedirects = [],
    rewrites: nextJsRewrites = [],
  } = manifest;

  const isEveryHeaderSupported = nextJsHeaders.every(isHeaderSupportedByHosting);
  if (!isEveryHeaderSupported) {
    reasonsForBackend.add("advanced headers");
  }

  const headers: HostingHeadersWithSource[] = nextJsHeaders
    .filter(isHeaderSupportedByHosting)
    .map(({ source, headers }) => ({
      // clean up unnecessary escaping
      source: cleanEscapedChars(source),
      headers,
    }));

  const [appPathsManifest, appPathRoutesManifest] = await Promise.all([
    readJSON<AppPathsManifest>(join(dir, distDir, "server", APP_PATHS_MANIFEST)).catch(
      () => undefined
    ),
    readJSON<AppPathRoutesManifest>(join(dir, distDir, APP_PATH_ROUTES_MANIFEST)).catch(
      () => undefined
    ),
  ]);

  if (appPathRoutesManifest) {
    const headersFromMetaFiles = await getHeadersFromMetaFiles(dir, distDir, appPathRoutesManifest);
    headers.push(...headersFromMetaFiles);

    if (appPathsManifest) {
      const unrenderedServerComponents = getNonStaticServerComponents(
        appPathsManifest,
        appPathRoutesManifest,
        prerenderedRoutes,
        dynamicRoutes
      );

      for (const key of unrenderedServerComponents) {
        reasonsForBackend.add(`non-static component ${key}`);
      }
    }
  }

  const isEveryRedirectSupported = nextJsRedirects
    .filter((it) => !it.internal)
    .every(isRedirectSupportedByHosting);
  if (!isEveryRedirectSupported) {
    reasonsForBackend.add("advanced redirects");
  }

  const redirects = nextJsRedirects
    .filter(isRedirectSupportedByHosting)
    .map(({ source, destination, statusCode: type }) => ({
      // clean up unnecessary escaping
      source: cleanEscapedChars(source),
      destination,
      type,
    }));

  const nextJsRewritesToUse = getNextjsRewritesToUse(nextJsRewrites);

  // rewrites.afterFiles / rewrites.fallback are not supported by firebase.json
  if (
    !Array.isArray(nextJsRewrites) &&
    (nextJsRewrites.afterFiles?.length || nextJsRewrites.fallback?.length)
  ) {
    reasonsForBackend.add("advanced rewrites");
  }

  const isEveryRewriteSupported = nextJsRewritesToUse.every(isRewriteSupportedByHosting);
  if (!isEveryRewriteSupported) {
    reasonsForBackend.add("advanced rewrites");
  }

  // Can we change i18n into Firebase settings?
  const rewrites = nextJsRewritesToUse
    .filter(isRewriteSupportedByHosting)
    .map(({ source, destination }) => ({
      // clean up unnecessary escaping
      source: cleanEscapedChars(source),
      destination,
    }));

  const wantsBackend = reasonsForBackend.size > 0;

  if (wantsBackend) {
    const numberOfReasonsToList = process.env.DEBUG ? Infinity : DEFAULT_NUMBER_OF_REASONS_TO_LIST;
    console.log("Building a Cloud Function to run this application. This is needed due to:");
    for (const reason of Array.from(reasonsForBackend).slice(0, numberOfReasonsToList)) {
      console.log(` • ${reason}`);
    }
    if (reasonsForBackend.size > numberOfReasonsToList) {
      console.log(
        ` • and ${
          reasonsForBackend.size - numberOfReasonsToList
        } other reasons, use --debug to see more`
      );
    }
    console.log("");
  }

  return { wantsBackend, headers, redirects, rewrites, trailingSlash };
}

/**
 * Utility method used during project initialization.
 */
export async function init(setup: any, config: any) {
  const language = await promptOnce({
    type: "list",
    default: "TypeScript",
    message: "What language would you like to use?",
    choices: ["JavaScript", "TypeScript"],
  });
  execSync(
    `npx --yes create-next-app@latest -e hello-world ${setup.hosting.source} --use-npm ${
      language === "TypeScript" ? "--ts" : "--js"
    }`,
    { stdio: "inherit", cwd: config.projectDir }
  );
}

/**
 * Create a directory for SSG content.
 */
export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  const { distDir } = await getConfig(sourceDir);

  const publicPath = join(sourceDir, "public");
  await mkdir(join(destDir, "_next", "static"), { recursive: true });
  if (await pathExists(publicPath)) {
    await copy(publicPath, destDir);
  }
  await copy(join(sourceDir, distDir, "static"), join(destDir, "_next", "static"));

  // Copy over the default html files
  for (const file of ["index.html", "404.html", "500.html"]) {
    const pagesPath = join(sourceDir, distDir, "server", "pages", file);
    if (await pathExists(pagesPath)) {
      await copyFile(pagesPath, join(destDir, file));
      continue;
    }
    const appPath = join(sourceDir, distDir, "server", "app", file);
    if (await pathExists(appPath)) {
      await copyFile(appPath, join(destDir, file));
    }
  }

  const [
    middlewareManifest,
    prerenderManifest,
    routesManifest,
    pagesManifest,
    appPathRoutesManifest,
  ] = await Promise.all([
    readJSON<MiddlewareManifest>(join(sourceDir, distDir, "server", MIDDLEWARE_MANIFEST)),
    readJSON<PrerenderManifest>(join(sourceDir, distDir, PRERENDER_MANIFEST)),
    readJSON<Manifest>(join(sourceDir, distDir, ROUTES_MANIFEST)),
    readJSON<PagesManifest>(join(sourceDir, distDir, "server", PAGES_MANIFEST)),
    readJSON<AppPathRoutesManifest>(join(sourceDir, distDir, APP_PATH_ROUTES_MANIFEST)).catch(
      () => ({})
    ),
  ]);

  const appPathRoutesEntries = Object.entries(appPathRoutesManifest);

  const middlewareMatcherRegexes = Object.values(middlewareManifest.middleware)
    .map((it) => it.matchers)
    .flat()
    .map((it) => new RegExp(it.regexp));

  const { redirects = [], rewrites = [], headers = [] } = routesManifest;

  const rewritesRegexesNotSupportedByHosting = getNextjsRewritesToUse(rewrites)
    .filter((rewrite) => !isRewriteSupportedByHosting(rewrite))
    .map((rewrite) => new RegExp(rewrite.regex));

  const redirectsRegexesNotSupportedByHosting = redirects
    .filter((redirect) => !isRedirectSupportedByHosting(redirect))
    .map((redirect) => new RegExp(redirect.regex));

  const headersRegexesNotSupportedByHosting = headers
    .filter((header) => !isHeaderSupportedByHosting(header))
    .map((header) => new RegExp(header.regex));

  const pathsUsingsFeaturesNotSupportedByHosting = [
    ...middlewareMatcherRegexes,
    ...rewritesRegexesNotSupportedByHosting,
    ...redirectsRegexesNotSupportedByHosting,
    ...headersRegexesNotSupportedByHosting,
  ];

  const pagesManifestLikePrerender: PrerenderManifest["routes"] = Object.fromEntries(
    Object.entries(pagesManifest)
      .filter(([, srcRoute]) => srcRoute.endsWith(".html"))
      .map(([path]) => {
        return [path, { srcRoute: null, initialRevalidateSeconds: false, dataRoute: "" }];
      })
  );

  const routesToCopy: PrerenderManifest["routes"] = {
    ...prerenderManifest.routes,
    ...pagesManifestLikePrerender,
  };

  await Promise.all(
    Object.entries(routesToCopy).map(async ([path, route]) => {
      if (
        route.initialRevalidateSeconds ||
        pathsUsingsFeaturesNotSupportedByHosting.some((it) => path.match(it))
      ) {
        return;
      }

      const appPathRoute =
        route.srcRoute && appPathRoutesEntries.find(([, it]) => it === route.srcRoute)?.[0];
      const contentDist = join(sourceDir, distDir, "server", appPathRoute ? "app" : "pages");

      const parts = path.split("/").filter((it) => !!it);
      const partsOrIndex = parts.length > 0 ? parts : ["index"];

      let sourcePath = join(contentDist, ...partsOrIndex);
      let destPath = join(destDir, ...partsOrIndex);
      if (!fileExistsSync(sourcePath) && fileExistsSync(`${sourcePath}.html`)) {
        sourcePath += ".html";
        destPath += ".html";
      } else if (appPathRoute && basename(appPathRoute) === "route" && dirExistsSync(sourcePath)) {
        sourcePath += ".body";
      }

      if (!pathExistsSync(sourcePath)) {
        console.error(`Cannot find ${path} in your compiled Next.js application.`);
        return;
      }

      await mkdir(dirname(destPath), { recursive: true });

      await copyFile(sourcePath, destPath);

      if (route.dataRoute && !appPathRoute) {
        const dataSourcePath = `${join(...partsOrIndex)}.json`;
        const dataDestPath = join(destDir, route.dataRoute);
        await mkdir(dirname(dataDestPath), { recursive: true });
        await copyFile(join(contentDist, dataSourcePath), dataDestPath);
      }
    })
  );
}

const BUNDLE_NEXT_CONFIG_TIMEOUT = 10_000;

/**
 * Create a directory for SSR content.
 */
export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const { distDir } = await getConfig(sourceDir);
  const packageJson = await readJSON(join(sourceDir, "package.json"));
  // Bundle their next.config.js with esbuild via NPX, pinned version was having troubles on m1
  // macs and older Node versions; either way, we should avoid taking on any deps in firebase-tools
  // Alternatively I tried using @swc/spack and the webpack bundled into Next.js but was
  // encountering difficulties with both of those
  if (existsSync(join(sourceDir, "next.config.js"))) {
    try {
      const productionDeps = await new Promise<string[]>((resolve) => {
        const dependencies: string[] = [];
        const npmLs = spawn("npm", ["ls", "--omit=dev", "--all", "--json=true"], {
          cwd: sourceDir,
          timeout: NPM_COMMAND_TIMEOUT_MILLIES,
        });
        const pipeline = chain([
          npmLs.stdout,
          parser({ packValues: false, packKeys: true, streamValues: false }),
          pick({ filter: "dependencies" }),
          streamObject(),
          ({ key, value }: { key: string; value: NpmLsDepdendency }) => [
            key,
            ...allDependencyNames(value),
          ],
        ]);
        pipeline.on("data", (it: string) => dependencies.push(it));
        pipeline.on("end", () => {
          resolve([...new Set(dependencies)]);
        });
      });
      // Mark all production deps as externals, so they aren't bundled
      // DevDeps won't be included in the Cloud Function, so they should be bundled
      const esbuildArgs = productionDeps
        .map((it) => `--external:${it}`)
        .concat(
          "--bundle",
          "--platform=node",
          `--target=node${NODE_VERSION}`,
          `--outdir=${destDir}`,
          "--log-level=error"
        );
      const bundle = spawnSync("npx", ["--yes", "esbuild", "next.config.js", ...esbuildArgs], {
        cwd: sourceDir,
        timeout: BUNDLE_NEXT_CONFIG_TIMEOUT,
      });
      if (bundle.status) {
        throw new FirebaseError(bundle.stderr.toString());
      }
    } catch (e: any) {
      console.warn(
        "Unable to bundle next.config.js for use in Cloud Functions, proceeding with deploy but problems may be enountered."
      );
      console.error(e.message || e);
      copy(join(sourceDir, "next.config.js"), join(destDir, "next.config.js"));
    }
  }
  if (await pathExists(join(sourceDir, "public"))) {
    await mkdir(join(destDir, "public"));
    await copy(join(sourceDir, "public"), join(destDir, "public"));
  }

  // Add the `sharp` library if `/app` folder exists (i.e. Next.js 13+)
  // or usesNextImage in `export-marker.json` is set to true.
  // As of (10/2021) the new Next.js 13 route is in beta, and usesNextImage is always being set to false
  // if the image component is used in pages coming from the new `/app` routes.
  if (
    !(await hasUnoptimizedImage(sourceDir, distDir)) &&
    (usesAppDirRouter(sourceDir) || (await usesNextImage(sourceDir, distDir)))
  ) {
    packageJson.dependencies["sharp"] = "latest";
  }

  await mkdirp(join(destDir, distDir));
  await copy(join(sourceDir, distDir), join(destDir, distDir));
  return { packageJson, frameworksEntry: "next.js" };
}

/**
 * Create a dev server.
 */
export async function getDevModeHandle(dir: string, hostingEmulatorInfo?: EmulatorInfo) {
  // throw error when using Next.js middleware with firebase serve
  if (!hostingEmulatorInfo) {
    if (await isUsingMiddleware(dir, true)) {
      throw new FirebaseError(
        `${clc.bold("firebase serve")} does not support Next.js Middleware. Please use ${clc.bold(
          "firebase emulators:start"
        )} instead.`
      );
    }
  }

  let next: any = relativeRequire(dir, "next");
  if (next.default) next = next.default;
  const nextApp: NextServer = next({
    dev: true,
    dir,
    hostname: hostingEmulatorInfo?.host,
    port: hostingEmulatorInfo?.port,
  });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  return simpleProxy(async (req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = parse(req.url!, true);
    await handler(req, res, parsedUrl);
  });
}

async function getConfig(dir: string): Promise<NextConfig & { distDir: string }> {
  let config: NextConfig = {};
  if (existsSync(join(dir, "next.config.js"))) {
    const version = getNextVersion(dir);
    if (!version) throw new Error("Unable to find the next dep, try NPM installing?");
    if (gte(version, "12.0.0")) {
      const { default: loadConfig } = relativeRequire(dir, "next/dist/server/config");
      const { PHASE_PRODUCTION_BUILD } = relativeRequire(dir, "next/constants");
      config = await loadConfig(PHASE_PRODUCTION_BUILD, dir, null);
    } else {
      try {
        config = await import(pathToFileURL(join(dir, "next.config.js")).toString());
      } catch (e) {
        throw new Error("Unable to load next.config.js.");
      }
    }
  }
  return {
    distDir: ".next",
    // trailingSlash defaults to false in Next.js: https://nextjs.org/docs/api-reference/next.config.js/trailing-slash
    trailingSlash: false,
    ...config,
  };
}
