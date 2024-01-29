import { execSync } from "child_process";
import { spawn, sync as spawnSync } from "cross-spawn";
import { mkdir, copyFile } from "fs/promises";
import { basename, dirname, join } from "path";
import type { NextConfig } from "next";
import type { PrerenderManifest } from "next/dist/build";
import type { DomainLocale } from "next/dist/server/config";
import type { PagesManifest } from "next/dist/build/webpack/plugins/pages-manifest-plugin";
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
import { fileExistsSync } from "../../fsutils";

import { promptOnce } from "../../prompt";
import { FirebaseError } from "../../error";
import type { EmulatorInfo } from "../../emulator/types";
import {
  readJSON,
  simpleProxy,
  warnIfCustomBuildScript,
  relativeRequire,
  findDependency,
  validateLocales,
  getNodeModuleBin,
} from "../utils";
import {
  BuildResult,
  Framework,
  FrameworkContext,
  FrameworkType,
  SupportLevel,
} from "../interfaces";

import {
  cleanEscapedChars,
  getNextjsRewritesToUse,
  isHeaderSupportedByHosting,
  isRedirectSupportedByHosting,
  isRewriteSupportedByHosting,
  isUsingImageOptimization,
  isUsingMiddleware,
  allDependencyNames,
  getMiddlewareMatcherRegexes,
  getNonStaticRoutes,
  getNonStaticServerComponents,
  getHeadersFromMetaFiles,
  cleanI18n,
  getNextVersion,
  hasStaticAppNotFoundComponent,
} from "./utils";
import { NODE_VERSION, NPM_COMMAND_TIMEOUT_MILLIES, SHARP_VERSION, I18N_ROOT } from "../constants";
import type {
  AppPathRoutesManifest,
  AppPathsManifest,
  HostingHeadersWithSource,
  RoutesManifest,
  NpmLsDepdendency,
  MiddlewareManifest,
} from "./interfaces";
import {
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  APP_PATHS_MANIFEST,
  ESBUILD_VERSION,
} from "./constants";
import { getAllSiteDomains, getDeploymentDomain } from "../../hosting/api";
import { logger } from "../../logger";

const DEFAULT_BUILD_SCRIPT = ["next build"];
const PUBLIC_DIR = "public";

export const supportedRange = "12 - 14.0";

export const name = "Next.js";
export const support = SupportLevel.Preview;
export const type = FrameworkType.MetaFramework;
export const docsUrl = "https://firebase.google.com/docs/hosting/frameworks/nextjs";

const BUNDLE_NEXT_CONFIG_TIMEOUT = 60_000;
const DEFAULT_NUMBER_OF_REASONS_TO_LIST = 5;

function getReactVersion(cwd: string): string | undefined {
  return findDependency("react-dom", { cwd, omitDev: false })?.version;
}

/**
 * Returns whether this codebase is a Next.js backend.
 */
export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;
  const version = getNextVersion(dir);
  if (!(await pathExists("next.config.js")) && !version) return;

  return { mayWantBackend: true, publicDirectory: join(dir, PUBLIC_DIR), version };
}

/**
 * Build a next.js application.
 */
export async function build(
  dir: string,
  target: string,
  context?: FrameworkContext,
): Promise<BuildResult> {
  await warnIfCustomBuildScript(dir, name, DEFAULT_BUILD_SCRIPT);

  const reactVersion = getReactVersion(dir);
  if (reactVersion && gte(reactVersion, "18.0.0")) {
    // This needs to be set for Next build to succeed with React 18
    process.env.__NEXT_REACT_ROOT = "true";
  }

  const env = { ...process.env };

  if (context?.projectId && context?.site) {
    const deploymentDomain = await getDeploymentDomain(
      context.projectId,
      context.site,
      context.hostingChannel,
    );

    if (deploymentDomain) {
      // Add the deployment domain to VERCEL_URL env variable, which is
      // required for dynamic OG images to work without manual configuration.
      // See: https://nextjs.org/docs/app/api-reference/functions/generate-metadata#default-value
      env["VERCEL_URL"] = deploymentDomain;
    }
  }

  const cli = getNodeModuleBin("next", dir);

  const nextBuild = new Promise((resolve, reject) => {
    const buildProcess = spawn(cli, ["build"], { cwd: dir, env });
    buildProcess.stdout?.on("data", (data) => logger.info(data.toString()));
    buildProcess.stderr?.on("data", (data) => logger.info(data.toString()));
    buildProcess.on("error", (err) => {
      reject(new FirebaseError(`Unable to build your Next.js app: ${err}`));
    });
    buildProcess.on("exit", (code) => {
      resolve(code);
    });
  });
  await nextBuild;

  const reasonsForBackend = new Set();
  const { distDir, trailingSlash, basePath: baseUrl } = await getConfig(dir);

  if (await isUsingMiddleware(join(dir, distDir), false)) {
    reasonsForBackend.add("middleware");
  }

  if (await isUsingImageOptimization(dir, distDir)) {
    reasonsForBackend.add(`Image Optimization`);
  }

  const prerenderManifest = await readJSON<PrerenderManifest>(
    join(dir, distDir, PRERENDER_MANIFEST),
  );

  const dynamicRoutesWithFallback = Object.entries(prerenderManifest.dynamicRoutes || {}).filter(
    ([, it]) => it.fallback !== false,
  );
  if (dynamicRoutesWithFallback.length > 0) {
    for (const [key] of dynamicRoutesWithFallback) {
      reasonsForBackend.add(`use of fallback ${key}`);
    }
  }

  const routesWithRevalidate = Object.entries(prerenderManifest.routes).filter(
    ([, it]) => it.initialRevalidateSeconds,
  );
  if (routesWithRevalidate.length > 0) {
    for (const [, { srcRoute }] of routesWithRevalidate) {
      reasonsForBackend.add(`use of revalidate ${srcRoute}`);
    }
  }

  const pagesManifestJSON = await readJSON<PagesManifest>(
    join(dir, distDir, "server", PAGES_MANIFEST),
  );
  const prerenderedRoutes = Object.keys(prerenderManifest.routes);
  const dynamicRoutes = Object.keys(prerenderManifest.dynamicRoutes);

  const unrenderedPages = getNonStaticRoutes(pagesManifestJSON, prerenderedRoutes, dynamicRoutes);

  for (const key of unrenderedPages) {
    reasonsForBackend.add(`non-static route ${key}`);
  }

  const manifest = await readJSON<RoutesManifest>(join(dir, distDir, ROUTES_MANIFEST));

  const {
    headers: nextJsHeaders = [],
    redirects: nextJsRedirects = [],
    rewrites: nextJsRewrites = [],
    i18n: nextjsI18n,
  } = manifest;

  const isEveryHeaderSupported = nextJsHeaders.map(cleanI18n).every(isHeaderSupportedByHosting);
  if (!isEveryHeaderSupported) {
    reasonsForBackend.add("advanced headers");
  }

  const headers: HostingHeadersWithSource[] = nextJsHeaders
    .map(cleanI18n)
    .filter(isHeaderSupportedByHosting)
    .map(({ source, headers }) => ({
      // clean up unnecessary escaping
      source: cleanEscapedChars(source),
      headers,
    }));

  const [appPathsManifest, appPathRoutesManifest] = await Promise.all([
    readJSON<AppPathsManifest>(join(dir, distDir, "server", APP_PATHS_MANIFEST)).catch(
      () => undefined,
    ),
    readJSON<AppPathRoutesManifest>(join(dir, distDir, APP_PATH_ROUTES_MANIFEST)).catch(
      () => undefined,
    ),
  ]);

  if (appPathRoutesManifest) {
    const headersFromMetaFiles = await getHeadersFromMetaFiles(
      dir,
      distDir,
      baseUrl,
      appPathRoutesManifest,
    );
    headers.push(...headersFromMetaFiles);

    if (appPathsManifest) {
      const unrenderedServerComponents = getNonStaticServerComponents(
        appPathsManifest,
        appPathRoutesManifest,
        prerenderedRoutes,
        dynamicRoutes,
      );

      if (
        unrenderedServerComponents.has("/_not-found") &&
        (await hasStaticAppNotFoundComponent(dir, distDir))
      ) {
        unrenderedServerComponents.delete("/_not-found");
      }

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
    .map(cleanI18n)
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

  const rewrites = nextJsRewritesToUse
    .filter(isRewriteSupportedByHosting)
    .map(cleanI18n)
    .map(({ source, destination }) => ({
      // clean up unnecessary escaping
      source: cleanEscapedChars(source),
      destination,
    }));

  const wantsBackend = reasonsForBackend.size > 0;

  if (wantsBackend) {
    logger.info("Building a Cloud Function to run this application. This is needed due to:");
    for (const reason of Array.from(reasonsForBackend).slice(
      0,
      DEFAULT_NUMBER_OF_REASONS_TO_LIST,
    )) {
      logger.info(` • ${reason}`);
    }
    for (const reason of Array.from(reasonsForBackend).slice(DEFAULT_NUMBER_OF_REASONS_TO_LIST)) {
      logger.debug(` • ${reason}`);
    }
    if (reasonsForBackend.size > DEFAULT_NUMBER_OF_REASONS_TO_LIST && !process.env.DEBUG) {
      logger.info(
        ` • and ${
          reasonsForBackend.size - DEFAULT_NUMBER_OF_REASONS_TO_LIST
        } other reasons, use --debug to see more`,
      );
    }
    logger.info("");
  }

  const i18n = !!nextjsI18n;

  return {
    wantsBackend,
    headers,
    redirects,
    rewrites,
    trailingSlash,
    i18n,
    baseUrl,
  };
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
    `npx --yes create-next-app@"${supportedRange}" -e hello-world ${
      setup.hosting.source
    } --use-npm ${language === "TypeScript" ? "--ts" : "--js"}`,
    { stdio: "inherit", cwd: config.projectDir },
  );
}

/**
 * Create a directory for SSG content.
 */
export async function ɵcodegenPublicDirectory(
  sourceDir: string,
  destDir: string,
  _: string,
  context: { site: string; project: string },
) {
  const { distDir, i18n, basePath } = await getConfig(sourceDir);

  let matchingI18nDomain: DomainLocale | undefined = undefined;
  if (i18n?.domains) {
    const siteDomains = await getAllSiteDomains(context.project, context.site);
    matchingI18nDomain = i18n.domains.find(({ domain }) => siteDomains.includes(domain));
  }
  const singleLocaleDomain = !i18n || ((matchingI18nDomain || i18n).locales || []).length <= 1;

  const publicPath = join(sourceDir, "public");
  await mkdir(join(destDir, basePath, "_next", "static"), { recursive: true });
  if (await pathExists(publicPath)) {
    await copy(publicPath, join(destDir, basePath));
  }
  await copy(join(sourceDir, distDir, "static"), join(destDir, basePath, "_next", "static"));

  const [
    middlewareManifest,
    prerenderManifest,
    routesManifest,
    pagesManifest,
    appPathRoutesManifest,
  ] = await Promise.all([
    readJSON<MiddlewareManifest>(join(sourceDir, distDir, "server", MIDDLEWARE_MANIFEST)),
    readJSON<PrerenderManifest>(join(sourceDir, distDir, PRERENDER_MANIFEST)),
    readJSON<RoutesManifest>(join(sourceDir, distDir, ROUTES_MANIFEST)),
    readJSON<PagesManifest>(join(sourceDir, distDir, "server", PAGES_MANIFEST)),
    readJSON<AppPathRoutesManifest>(join(sourceDir, distDir, APP_PATH_ROUTES_MANIFEST)).catch(
      () => ({}),
    ),
  ]);

  const appPathRoutesEntries = Object.entries(appPathRoutesManifest);

  const middlewareMatcherRegexes = getMiddlewareMatcherRegexes(middlewareManifest);

  const { redirects = [], rewrites = [], headers = [] } = routesManifest;

  const rewritesRegexesNotSupportedByHosting = getNextjsRewritesToUse(rewrites)
    .filter((rewrite) => !isRewriteSupportedByHosting(rewrite))
    .map(cleanI18n)
    .map((rewrite) => new RegExp(rewrite.regex));

  const redirectsRegexesNotSupportedByHosting = redirects
    .filter((it) => !it.internal)
    .filter((redirect) => !isRedirectSupportedByHosting(redirect))
    .map(cleanI18n)
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
      }),
  );

  const routesToCopy: PrerenderManifest["routes"] = {
    ...prerenderManifest.routes,
    ...pagesManifestLikePrerender,
  };

  await Promise.all(
    Object.entries(routesToCopy).map(async ([path, route]) => {
      if (route.initialRevalidateSeconds) {
        logger.debug(`skipping ${path} due to revalidate`);
        return;
      }
      if (pathsUsingsFeaturesNotSupportedByHosting.some((it) => path.match(it))) {
        logger.debug(
          `skipping ${path} due to it matching an unsupported rewrite/redirect/header or middlware`,
        );
        return;
      }
      const appPathRoute =
        route.srcRoute && appPathRoutesEntries.find(([, it]) => it === route.srcRoute)?.[0];
      const contentDist = join(sourceDir, distDir, "server", appPathRoute ? "app" : "pages");

      const sourceParts = path.split("/").filter((it) => !!it);
      const locale = i18n?.locales.includes(sourceParts[0]) ? sourceParts[0] : undefined;
      const includeOnThisDomain =
        !locale ||
        !matchingI18nDomain ||
        matchingI18nDomain.defaultLocale === locale ||
        !matchingI18nDomain.locales ||
        matchingI18nDomain.locales.includes(locale);

      if (!includeOnThisDomain) {
        logger.debug(`skipping ${path} since it is for a locale not deployed on this domain`);
        return;
      }

      const sourcePartsOrIndex = sourceParts.length > 0 ? sourceParts : ["index"];
      const destParts = sourceParts.slice(locale ? 1 : 0);
      const destPartsOrIndex = destParts.length > 0 ? destParts : ["index"];
      const isDefaultLocale = !locale || (matchingI18nDomain || i18n)?.defaultLocale === locale;

      let sourcePath = join(contentDist, ...sourcePartsOrIndex);
      let localizedDestPath =
        !singleLocaleDomain &&
        locale &&
        join(destDir, I18N_ROOT, locale, basePath, ...destPartsOrIndex);
      let defaultDestPath = isDefaultLocale && join(destDir, basePath, ...destPartsOrIndex);
      if (!fileExistsSync(sourcePath) && fileExistsSync(`${sourcePath}.html`)) {
        sourcePath += ".html";
        if (localizedDestPath) localizedDestPath += ".html";
        if (defaultDestPath) defaultDestPath += ".html";
      } else if (
        appPathRoute &&
        basename(appPathRoute) === "route" &&
        fileExistsSync(`${sourcePath}.body`)
      ) {
        sourcePath += ".body";
      } else if (!pathExistsSync(sourcePath)) {
        console.error(`Cannot find ${path} in your compiled Next.js application.`);
        return;
      }

      if (localizedDestPath) {
        await mkdir(dirname(localizedDestPath), { recursive: true });
        await copyFile(sourcePath, localizedDestPath);
      }

      if (defaultDestPath) {
        await mkdir(dirname(defaultDestPath), { recursive: true });
        await copyFile(sourcePath, defaultDestPath);
      }

      if (route.dataRoute && !appPathRoute) {
        const dataSourcePath = `${join(...sourcePartsOrIndex)}.json`;
        const dataDestPath = join(destDir, basePath, route.dataRoute);
        await mkdir(dirname(dataDestPath), { recursive: true });
        await copyFile(join(contentDist, dataSourcePath), dataDestPath);
      }
    }),
  );
}

/**
 * Create a directory for SSR content.
 */
export async function ɵcodegenFunctionsDirectory(
  sourceDir: string,
  destDir: string,
  target: string,
  context?: FrameworkContext,
): ReturnType<NonNullable<Framework["ɵcodegenFunctionsDirectory"]>> {
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
          "--log-level=error",
        );
      const bundle = spawnSync(
        "npx",
        ["--yes", `esbuild@${ESBUILD_VERSION}`, "next.config.js", ...esbuildArgs],
        {
          cwd: sourceDir,
          timeout: BUNDLE_NEXT_CONFIG_TIMEOUT,
        },
      );
      if (bundle.status !== 0) {
        throw new FirebaseError(bundle.stderr.toString());
      }
    } catch (e: any) {
      console.warn(
        "Unable to bundle next.config.js for use in Cloud Functions, proceeding with deploy but problems may be enountered.",
      );
      console.error(e.message || e);
      copy(join(sourceDir, "next.config.js"), join(destDir, "next.config.js"));
    }
  }
  if (await pathExists(join(sourceDir, "public"))) {
    await mkdir(join(destDir, "public"));
    await copy(join(sourceDir, "public"), join(destDir, "public"));
  }

  // Add the `sharp` library if app is using image optimization
  if (await isUsingImageOptimization(sourceDir, distDir)) {
    packageJson.dependencies["sharp"] = SHARP_VERSION;
  }

  const dotEnv: Record<string, string> = {};
  if (context?.projectId && context?.site) {
    const deploymentDomain = await getDeploymentDomain(
      context.projectId,
      context.site,
      context.hostingChannel,
    );

    if (deploymentDomain) {
      // Add the deployment domain to VERCEL_URL env variable, which is
      // required for dynamic OG images to work without manual configuration.
      // See: https://nextjs.org/docs/app/api-reference/functions/generate-metadata#default-value
      dotEnv["VERCEL_URL"] = deploymentDomain;
    }
  }

  await mkdirp(join(destDir, distDir));
  await copy(join(sourceDir, distDir), join(destDir, distDir));
  return { packageJson, frameworksEntry: "next.js", dotEnv };
}

/**
 * Create a dev server.
 */
export async function getDevModeHandle(dir: string, _: string, hostingEmulatorInfo?: EmulatorInfo) {
  // throw error when using Next.js middleware with firebase serve
  if (!hostingEmulatorInfo) {
    if (await isUsingMiddleware(dir, true)) {
      throw new FirebaseError(
        `${clc.bold("firebase serve")} does not support Next.js Middleware. Please use ${clc.bold(
          "firebase emulators:start",
        )} instead.`,
      );
    }
  }

  let next = await relativeRequire(dir, "next");
  if ("default" in next) next = next.default;
  const nextApp = next({
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

async function getConfig(
  dir: string,
): Promise<Partial<NextConfig> & { distDir: string; trailingSlash: boolean; basePath: string }> {
  let config: NextConfig = {};
  if (existsSync(join(dir, "next.config.js"))) {
    const version = getNextVersion(dir);
    if (!version) throw new Error("Unable to find the next dep, try NPM installing?");
    if (gte(version, "12.0.0")) {
      const [{ default: loadConfig }, { PHASE_PRODUCTION_BUILD }] = await Promise.all([
        relativeRequire(dir, "next/dist/server/config"),
        relativeRequire(dir, "next/constants"),
      ]);
      config = await loadConfig(PHASE_PRODUCTION_BUILD, dir);
    } else {
      try {
        config = await import(pathToFileURL(join(dir, "next.config.js")).toString());
      } catch (e) {
        throw new Error("Unable to load next.config.js.");
      }
    }
  }
  validateLocales(config.i18n?.locales);
  return {
    distDir: ".next",
    // trailingSlash defaults to false in Next.js: https://nextjs.org/docs/api-reference/next.config.js/trailing-slash
    trailingSlash: false,
    basePath: "/",
    ...config,
  };
}
