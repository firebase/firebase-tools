import { execSync, spawnSync } from "child_process";
import { mkdir, copyFile, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { NextConfig } from "next";
import type { PrerenderManifest } from "next/dist/build";
import type { MiddlewareManifest } from "next/dist/build/webpack/plugins/middleware-plugin";
import type { PagesManifest } from "next/dist/build/webpack/plugins/pages-manifest-plugin";
import { copy, mkdirp, pathExists } from "fs-extra";
import { pathToFileURL, parse } from "url";
import { existsSync } from "fs";
import { gte } from "semver";
import { IncomingMessage, ServerResponse } from "http";
import * as clc from "colorette";

import {
  createServerResponseProxy,
  findDependency,
  FrameworkType,
  NODE_VERSION,
  relativeRequire,
  SupportLevel,
} from "..";
import { promptOnce } from "../../prompt";
import { FirebaseError } from "../../error";
import {
  cleanEscapedChars,
  getNextjsRewritesToUse,
  isHeaderSupportedByHosting,
  isRedirectSupportedByHosting,
  isRewriteSupportedByHosting,
  isUsingAppDirectory,
  isUsingImageOptimization,
  isUsingMiddleware,
  allDependencyNames,
} from "./utils";
import type { Manifest, NpmLsReturn } from "./interfaces";
import { readJSON, warnIfCustomBuildScript, memoize, webFramework } from "../utils";
import type { EmulatorInfo } from "../../emulator/types";
import { usesAppDirRouter, usesNextImage, hasUnoptimizedImage } from "./utils";
import {
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  BUILD_ID,
} from "./constants";

const DEFAULT_BUILD_SCRIPT = ["next build"];
const PUBLIC_DIR = "public";
const NAME = "Next.js";

// TODO move to "satisfies NextConfig" when we can
const DEFAULT_CONFIG = { distDir: ".next" };

type Config = Awaited<ReturnType<typeof NextJS["getConfig"]>>;

export const enum BuildTarget {
  FirebaseHosting = "Firebase Hosting",
}

interface FirebaseHostingOptions {
  functions: { destinationDir: string };
  hosting: { destinationDir: string };
}

@webFramework({
  name: NAME,
  key: "next",
  support: SupportLevel.Experimental,
  type: FrameworkType.MetaFramework,
})
class NextJS {
  @memoize() public static async discover(dir: string) {
    if (!(await pathExists(join(dir, "package.json")))) return;
    if (!(await pathExists("next.config.js")) && !getNextVersion(dir)) return;

    return { mayWantBackend: true, publicDirectory: join(dir, PUBLIC_DIR) };
  }

  public static async bootstrap(setup: any) {
    const language = await promptOnce({
      type: "list",
      default: "JavaScript",
      message: "What language would you like to use?",
      choices: ["JavaScript", "TypeScript"],
    });
    execSync(
      `npx --yes create-next-app@latest -e hello-world ${setup.hosting.source} --use-npm ${
        language === "TypeScript" ? "--ts" : ""
      }`,
      { stdio: "inherit" }
    );
  }

  @memoize() private static async getConfig(sourceDir: string) {
    const nextConfigPath = join(sourceDir, "next.config.js");
    let config: NextConfig = {};
    if (existsSync(nextConfigPath)) {
      const version = getNextVersion(sourceDir);
      if (!version) throw new Error("Unable to find the next dep, try NPM installing?");
      if (gte(version, "12.0.0")) {
        const { default: loadConfig } = relativeRequire(sourceDir, "next/dist/server/config");
        const { PHASE_PRODUCTION_BUILD } = relativeRequire(sourceDir, "next/constants");
        config = await loadConfig(PHASE_PRODUCTION_BUILD, sourceDir, null);
      } else {
        const nextConfigFileUrl = pathToFileURL(nextConfigPath).toString();
        try {
          config = await import(nextConfigFileUrl);
        } catch (e) {
          console.error("Had trouble reading the next.config.js, assuming defaults.");
        }
      }
    }
    return { ...DEFAULT_CONFIG, ...config };
  }

  private static async readBuildId(sourceDir: string) {
    const { distDir } = await NextJS.getConfig(sourceDir);
    const buildIdPath = join(sourceDir, distDir, BUILD_ID);
    if (!(await pathExists(buildIdPath))) return undefined;
    return (await readFile(buildIdPath)).toString();
  }

  public static async initialize(sourceDir: string, options: any) {
    const buildId = await NextJS.readBuildId(sourceDir);
    const config = await NextJS.getConfig(sourceDir);
    return new NextJS(sourceDir, options, buildId, config);
  }

  private constructor(
    public readonly sourceDir: string,
    public readonly options: any,
    private buildId: string | undefined,
    private readonly config: Config
  ) {}

  public async build() {
    await this.buildNextApp();
    this.buildId = await NextJS.readBuildId(this.sourceDir);
  }

  @memoize("sourceDir", "buildId") private async buildNextApp() {
    const { default: nextBuild } = relativeRequire(this.sourceDir, "next/dist/build");

    await warnIfCustomBuildScript(this.sourceDir, NAME, DEFAULT_BUILD_SCRIPT);

    const reactVersion = getReactVersion(this.sourceDir);
    if (reactVersion && gte(reactVersion, "18.0.0")) {
      // This needs to be set for Next build to succeed with React 18
      process.env.__NEXT_REACT_ROOT = "true";
    }

    await nextBuild(this.sourceDir, this.config as any, false, false, false).catch((e) => {
      // Err on the side of displaying this error, since this is likely a bug in
      // the developer's code that we want to display immediately
      console.error(e.message);
      throw e;
    });
  }

  public async generateFilesystemAPI(target: BuildTarget, options: FirebaseHostingOptions) {
    switch (target) {
      case BuildTarget.FirebaseHosting: {
        await Promise.all([
          this.codegenHostingPublicDirectory(options.hosting),
          this.codegenFunctionsDirectory(options.functions),
        ]);
        break;
      }
      default: {
        throw new Error(`Build target ${target} not implemented in NextJS adapter.`);
      }
    }
  }

  @memoize("sourceDir", "buildId", "options") public async wantsBackend() {
    const reasonsForBackend = [];
    const { distDir: nextBuildPath } = this.config;
    const nextBuildDir = join(this.sourceDir, nextBuildPath);

    if (await isUsingMiddleware(nextBuildDir, false)) {
      reasonsForBackend.push("middleware");
    }

    if (await isUsingImageOptimization(nextBuildDir)) {
      reasonsForBackend.push(`Image Optimization`);
    }

    if (isUsingAppDirectory(nextBuildDir)) {
      // Let's not get smart here, if they are using the app directory we should
      // opt for spinning up a Cloud Function. The app directory is unstable.
      reasonsForBackend.push("app directory (unstable)");
    }

    const prerenderManifest = await this.readPrerenderManifest();

    const dynamicRoutesWithFallback = Object.entries(prerenderManifest.dynamicRoutes || {}).filter(
      ([, it]) => it.fallback !== false
    );
    if (dynamicRoutesWithFallback.length > 0) {
      for (const [key] of dynamicRoutesWithFallback) {
        reasonsForBackend.push(`use of fallback ${key}`);
      }
    }

    const routesWithRevalidate = Object.entries(prerenderManifest.routes).filter(
      ([, it]) => it.initialRevalidateSeconds
    );
    if (routesWithRevalidate.length > 0) {
      for (const [key] of routesWithRevalidate) {
        reasonsForBackend.push(`use of revalidate ${key}`);
      }
    }

    const prerenderedRoutes = Object.keys(prerenderManifest.routes);
    const dynamicRoutes = Object.keys(prerenderManifest.dynamicRoutes);
    const unrenderedPages = Object.keys(await this.readPagesManifest()).filter(
      (it) =>
        !(
          ["/_app", "/", "/_error", "/_document", "/404"].includes(it) ||
          prerenderedRoutes.includes(it) ||
          dynamicRoutes.includes(it)
        )
    );
    if (unrenderedPages.length > 0) {
      for (const key of unrenderedPages) {
        reasonsForBackend.push(`non-static route ${key}`);
      }
    }

    const {
      headers: nextJsHeaders = [],
      redirects: nextJsRedirects = [],
      rewrites: nextJsRewrites = [],
    } = await this.readRoutesManifest();

    const isEveryHeaderSupported = nextJsHeaders.every(isHeaderSupportedByHosting);
    if (!isEveryHeaderSupported) {
      reasonsForBackend.push("advanced headers");
    }

    const isEveryRedirectSupported = nextJsRedirects.every(isRedirectSupportedByHosting);
    if (!isEveryRedirectSupported) {
      reasonsForBackend.push("advanced redirects");
    }

    const nextJsRewritesToUse = getNextjsRewritesToUse(nextJsRewrites);

    // rewrites.afterFiles / rewrites.fallback are not supported by firebase.json
    if (
      !Array.isArray(nextJsRewrites) &&
      (nextJsRewrites.afterFiles?.length || nextJsRewrites.fallback?.length)
    ) {
      reasonsForBackend.push("advanced rewrites");
    }

    const isEveryRewriteSupported = nextJsRewritesToUse.every(isRewriteSupportedByHosting);
    if (!isEveryRewriteSupported) {
      reasonsForBackend.push("advanced rewrites");
    }

    const wantsBackend = reasonsForBackend.length > 0;
    if (!wantsBackend) return false;

    const numberOfReasonsToList = process.env.DEBUG ? Infinity : DEFAULT_NUMBER_OF_REASONS_TO_LIST;
    console.log("Building a Cloud Function to run this application. This is needed due to:");
    for (const reason of reasonsForBackend.slice(0, numberOfReasonsToList)) {
      console.log(` • ${reason}`);
    }
    if (reasonsForBackend.length > numberOfReasonsToList) {
      console.log(
        ` • and ${
          reasonsForBackend.length - numberOfReasonsToList
        } other reasons, use --debug to see more`
      );
    }
    console.log("");
    return true;
  }

  @memoize("sourceDir", "buildId", "options") private async codegenHostingPublicDirectory({
    destinationDir,
  }: FirebaseHostingOptions["hosting"]) {
    const [middlewareManifest, prerenderManifest, routesManifest] = await Promise.all([
      this.readMiddlewareManifest(),
      this.readPrerenderManifest(),
      this.readRoutesManifest(),
    ]);

    const { headers = [], redirects = [], rewrites = [] } = routesManifest;

    this.options.headers ||= [];
    this.options.headers.push(
      ...headers.filter(isHeaderSupportedByHosting).map(({ source, headers }) => ({
        // clean up unnecessary escaping
        source: cleanEscapedChars(source),
        headers,
      }))
    );

    this.options.redirects ||= [];
    this.options.redirects.push(
      ...redirects
        .filter(isRedirectSupportedByHosting)
        .map(({ source, destination, statusCode: type }) => ({
          // clean up unnecessary escaping
          source: cleanEscapedChars(source),
          destination,
          type,
        }))
    );

    // Can we change i18n into Firebase settings?
    this.options.rewrites ||= [];
    this.options.rewrites.push(
      ...getNextjsRewritesToUse(rewrites)
        .filter(isRewriteSupportedByHosting)
        .map(({ source, destination }) => ({
          // clean up unnecessary escaping
          source: cleanEscapedChars(source),
          destination,
        }))
    );

    const { distDir: nextBuildPath } = this.config;
    const nextBuildDir = join(this.sourceDir, nextBuildPath);

    const publicPath = join(this.sourceDir, "public");

    const asyncOperations: Promise<any>[] = [];

    asyncOperations.push(
      pathExists(publicPath).then((it) => {
        it && copy(publicPath, destinationDir);
      })
    );

    asyncOperations.push(
      mkdir(join(destinationDir, "_next", "static"), { recursive: true }).then(() =>
        copy(join(nextBuildDir, "static"), join(destinationDir, "_next", "static"))
      )
    );

    // Copy over the default html files
    asyncOperations.push(
      ...["index.html", "404.html", "500.html"].map(async (file) => {
        const pagesPath = join(nextBuildDir, "server", "pages", file);
        if (await pathExists(pagesPath)) {
          await copyFile(pagesPath, join(destinationDir, file));
          return;
        }
        const appPath = join(nextBuildDir, "server", "app", file);
        if (await pathExists(appPath)) {
          await copyFile(appPath, join(destinationDir, file));
        }
      })
    );

    const middlewareMatcherRegexes = Object.values(middlewareManifest.middleware)
      .map((it) => it.matchers)
      .flat()
      .map((it) => new RegExp(it.regexp));

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

    asyncOperations.push(
      ...Object.entries(prerenderManifest.routes).map(async ([path, route]) => {
        if (
          route.initialRevalidateSeconds ||
          pathsUsingsFeaturesNotSupportedByHosting.some((it) => path.match(it))
        ) {
          return;
        }

        const isReactServerComponent = route.dataRoute.endsWith(".rsc");
        const contentDist = join(nextBuildDir, "server", isReactServerComponent ? "app" : "pages");

        const parts = path.split("/").filter((it) => !!it);
        const partsOrIndex = parts.length > 0 ? parts : ["index"];

        const htmlPath = `${join(...partsOrIndex)}.html`;
        await mkdir(join(destinationDir, dirname(htmlPath)), { recursive: true });
        await copyFile(join(contentDist, htmlPath), join(destinationDir, htmlPath));

        if (!isReactServerComponent) {
          const dataPath = `${join(...partsOrIndex)}.json`;
          await mkdir(join(destinationDir, dirname(route.dataRoute)), { recursive: true });
          await copyFile(join(contentDist, dataPath), join(destinationDir, route.dataRoute));
        }
      })
    );

    await Promise.all(asyncOperations);
  }

  @memoize("sourceDir", "buildId", "options") private async codegenFunctionsDirectory({
    destinationDir,
  }: FirebaseHostingOptions["functions"]) {
    if (!(await this.wantsBackend())) return;

    const { distDir: nextBuildPath } = this.config;
    const nextBuildDir = join(this.sourceDir, nextBuildPath);

    const packageJson = await readJSON(join(this.sourceDir, "package.json"));
    if (existsSync(join(this.sourceDir, "next.config.js"))) {
      // Bundle their next.config.js with esbuild via NPX, pinned version was having troubles on m1
      // macs and older Node versions; either way, we should avoid taking on any deps in firebase-tools
      // Alternatively I tried using @swc/spack and the webpack bundled into Next.js but was
      // encountering difficulties with both of those
      const dependencyTree: NpmLsReturn = JSON.parse(
        spawnSync("npm", ["ls", "--omit=dev", "--all", "--json"], {
          cwd: this.sourceDir,
        }).stdout.toString()
      );
      // Mark all production deps as externals, so they aren't bundled
      // DevDeps won't be included in the Cloud Function, so they should be bundled
      const esbuildArgs = allDependencyNames(dependencyTree)
        .map((it) => `--external:${it}`)
        .concat(
          "--bundle",
          "--platform=node",
          `--target=node${NODE_VERSION}`,
          `--outdir=${destinationDir}`,
          "--log-level=error"
        );
      const bundle = spawnSync("npx", ["--yes", "esbuild", "next.config.js", ...esbuildArgs], {
        cwd: this.sourceDir,
      });
      if (bundle.status) {
        console.error(bundle.stderr.toString());
        throw new FirebaseError("Unable to bundle next.config.js for use in Cloud Functions");
      }
    }

    if (await pathExists(join(this.sourceDir, "public"))) {
      await mkdir(join(destinationDir, "public"));
      await copy(join(this.sourceDir, "public"), join(destinationDir, "public"));
    }

    // Add the `sharp` library if `/app` folder exists (i.e. Next.js 13+)
    // or usesNextImage in `export-marker.json` is set to true.
    // As of (10/2021) the new Next.js 13 route is in beta, and usesNextImage is always being set to false
    // if the image component is used in pages coming from the new `/app` routes.
    if (
      !(await hasUnoptimizedImage(this.sourceDir, nextBuildPath)) &&
      (usesAppDirRouter(this.sourceDir) || (await usesNextImage(this.sourceDir, nextBuildPath)))
    ) {
      packageJson.dependencies["sharp"] = "latest";
    }

    await mkdirp(join(destinationDir, nextBuildPath));
    await copy(nextBuildDir, join(destinationDir, nextBuildPath));

    await writeFile(join(destinationDir, "package.json"), JSON.stringify(packageJson));
  }

  @memoize("sourceDir", "buildId") private async readMiddlewareManifest() {
    if (!this.buildId) throw new Error(`Must run build before reading ${MIDDLEWARE_MANIFEST}`);
    return await readJSON<MiddlewareManifest>(
      join(this.sourceDir, this.config.distDir, "server", MIDDLEWARE_MANIFEST)
    );
  }

  @memoize("sourceDir", "buildId") private async readPrerenderManifest() {
    if (!this.buildId) throw new Error(`Must run build before reading ${PRERENDER_MANIFEST}`);
    return await readJSON<PrerenderManifest>(
      join(this.sourceDir, this.config.distDir, PRERENDER_MANIFEST)
    );
  }

  @memoize("sourceDir", "buildId") private async readRoutesManifest() {
    if (!this.buildId) throw new Error(`Must run build before reading ${ROUTES_MANIFEST}`);
    return await readJSON<Manifest>(join(this.sourceDir, this.config.distDir, ROUTES_MANIFEST));
  }

  @memoize("sourceDir", "buildId") private async readPagesManifest() {
    if (!this.buildId) throw new Error(`Must run build before reading ${PAGES_MANIFEST}`);
    return await readJSON<PagesManifest>(
      join(this.sourceDir, this.config.distDir, "server", PAGES_MANIFEST)
    );
  }
}

const DEFAULT_NUMBER_OF_REASONS_TO_LIST = 5;

function getNextVersion(cwd: string): string | undefined {
  return findDependency("next", { cwd, depth: 0, omitDev: false })?.version;
}

function getReactVersion(cwd: string): string | undefined {
  return findDependency("react-dom", { cwd, omitDev: false })?.version;
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

  const { default: next } = relativeRequire(dir, "next");
  const nextApp = next({
    dev: true,
    dir,
    hostname: hostingEmulatorInfo?.host,
    port: hostingEmulatorInfo?.port,
  });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const parsedUrl = parse(req.url!, true);
    const proxy = createServerResponseProxy(req, res, next);
    handler(req, proxy, parsedUrl);
  };
}
