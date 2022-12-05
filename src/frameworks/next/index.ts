import { execSync } from "child_process";
import { readFile, mkdir, copyFile } from "fs/promises";
import { dirname, join } from "path";
import type { NextConfig } from "next";
import { copy, mkdirp, pathExists } from "fs-extra";
import { pathToFileURL, parse } from "url";
import { existsSync } from "fs";

import {
  BuildResult,
  createServerResponseProxy,
  findDependency,
  FrameworkType,
  NODE_VERSION,
  relativeRequire,
  SupportLevel,
} from "..";
import { promptOnce } from "../../prompt";
import { gte } from "semver";
import { IncomingMessage, ServerResponse } from "http";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { fileExistsSync } from "../../fsutils";
import {
  cleanEscapedChars,
  getNextjsRewritesToUse,
  isHeaderSupportedByFirebase,
  isRedirectSupportedByFirebase,
  isRewriteSupportedByFirebase,
} from "./utils";
import type { Manifest } from "./interfaces";

const CLI_COMMAND = join(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

export const name = "Next.js";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;

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
  // TODO don't hardcode public dir
  return { mayWantBackend: true, publicDirectory: join(dir, "public") };
}

/**
 * Build a next.js application.
 */
export async function build(dir: string): Promise<BuildResult> {
  const { default: nextBuild } = relativeRequire(dir, "next/dist/build");

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

  try {
    // Using spawn here, rather than their programatic API because I can't silence it
    // Failures with Next export are expected, we're just trying to do it if we can
    execSync(`${CLI_COMMAND} export`, { cwd: dir, stdio: "ignore" });
  } catch (e) {
    // continue, failure is expected
  }

  let wantsBackend = true;
  const { distDir } = await getConfig(dir);
  const exportDetailPath = join(dir, distDir, "export-detail.json");
  const exportDetailExists = await pathExists(exportDetailPath);
  const exportDetailBuffer = exportDetailExists ? await readFile(exportDetailPath) : undefined;
  const exportDetailJson = exportDetailBuffer && JSON.parse(exportDetailBuffer.toString());
  if (exportDetailJson?.success) {
    const appPathRoutesManifestPath = join(dir, distDir, "app-path-routes-manifest.json");
    const appPathRoutesManifestJSON = fileExistsSync(appPathRoutesManifestPath)
      ? await readFile(appPathRoutesManifestPath).then((it) => JSON.parse(it.toString()))
      : {};
    const prerenderManifestJSON = await readFile(
      join(dir, distDir, "prerender-manifest.json")
    ).then((it) => JSON.parse(it.toString()));
    const anyDynamicRouteFallbacks = !!Object.values(
      prerenderManifestJSON.dynamicRoutes || {}
    ).find((it: any) => it.fallback !== false);
    const pagesManifestJSON = await readFile(
      join(dir, distDir, "server", "pages-manifest.json")
    ).then((it) => JSON.parse(it.toString()));
    const prerenderedRoutes = Object.keys(prerenderManifestJSON.routes);
    const dynamicRoutes = Object.keys(prerenderManifestJSON.dynamicRoutes);
    const unrenderedPages = [
      ...Object.keys(pagesManifestJSON),
      // TODO flush out fully rendered detection with a app directory (Next 13)
      // we shouldn't go too crazy here yet, as this is currently an expiriment
      ...Object.values<string>(appPathRoutesManifestJSON),
    ].filter(
      (it) =>
        !(
          ["/_app", "/", "/_error", "/_document", "/404"].includes(it) ||
          prerenderedRoutes.includes(it) ||
          dynamicRoutes.includes(it)
        )
    );
    // TODO log these as a reason why Cloud Functions are needed
    if (!anyDynamicRouteFallbacks && unrenderedPages.length === 0) {
      wantsBackend = false;
    }
  }

  const manifestBuffer = await readFile(join(dir, distDir, "routes-manifest.json"));
  const manifest = JSON.parse(manifestBuffer.toString()) as Manifest;
  const {
    headers: nextJsHeaders = [],
    redirects: nextJsRedirects = [],
    rewrites: nextJsRewrites = [],
  } = manifest;

  const hasUnsupportedHeader = nextJsHeaders.some((header) => !isHeaderSupportedByFirebase(header));
  if (hasUnsupportedHeader) wantsBackend = true;

  const headers = nextJsHeaders.filter(isHeaderSupportedByFirebase).map(({ source, headers }) => ({
    // clean up unnecessary escaping
    source: cleanEscapedChars(source),
    headers,
  }));

  const hasUnsupportedRedirect = nextJsRedirects.some(
    (redirect) => !isRedirectSupportedByFirebase(redirect)
  );
  if (hasUnsupportedRedirect) wantsBackend = true;

  const redirects = nextJsRedirects
    .filter(isRedirectSupportedByFirebase)
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
    wantsBackend = true;
  } else {
    const hasUnsupportedRewrite = nextJsRewritesToUse.some(
      (rewrite) => !isRewriteSupportedByFirebase(rewrite)
    );
    if (hasUnsupportedRewrite) wantsBackend = true;
  }

  // Can we change i18n into Firebase settings?
  const rewrites = nextJsRewritesToUse
    .filter(isRewriteSupportedByFirebase)
    .map(({ source, destination }) => ({
      // clean up unnecessary escaping
      source: cleanEscapedChars(source),
      destination,
    }));

  return { wantsBackend, headers, redirects, rewrites };
}

/**
 * Utility method used during project initialization.
 */
export async function init(setup: any) {
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

/**
 * Create a directory for SSG content.
 */
export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  const { distDir } = await getConfig(sourceDir);
  const exportDetailPath = join(sourceDir, distDir, "export-detail.json");
  const exportDetailExists = await pathExists(exportDetailPath);
  const exportDetailBuffer = exportDetailExists ? await readFile(exportDetailPath) : undefined;
  const exportDetailJson = exportDetailBuffer && JSON.parse(exportDetailBuffer.toString());
  if (exportDetailJson?.success) {
    copy(exportDetailJson.outDirectory, destDir);
  } else {
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

    const [prerenderManifestBuffer, routesManifestBuffer] = await Promise.all([
      readFile(
        join(
          sourceDir,
          distDir,
          "prerender-manifest.json" // TODO: get this from next/constants
        )
      ),
      readFile(
        join(
          sourceDir,
          distDir,
          "routes-manifest.json" // TODO: get this from next/constants
        )
      ),
    ]);

    const prerenderManifest = JSON.parse(prerenderManifestBuffer.toString());
    const routesManifest = JSON.parse(routesManifestBuffer.toString()) as Manifest;

    const { redirects = [], rewrites = [], headers = [] } = routesManifest;

    const rewritesToUse = getNextjsRewritesToUse(rewrites);
    const rewritesNotSupportedByFirebase = rewritesToUse.filter(
      (rewrite) => !isRewriteSupportedByFirebase(rewrite)
    );
    const redirectsNotSupportedByFirebase = redirects.filter(
      (redirect) => !isRedirectSupportedByFirebase(redirect)
    );
    const headersNotSupportedByFirebase = headers.filter(
      (header) => !isHeaderSupportedByFirebase(header)
    );

    for (const path in prerenderManifest.routes) {
      if (prerenderManifest.routes[path]) {
        // Skip ISR in the deploy to hosting
        const { initialRevalidateSeconds } = prerenderManifest.routes[path];
        if (initialRevalidateSeconds) {
          continue;
        }

        const routeMatchUnsupportedRewrite = rewritesNotSupportedByFirebase.some((rewrite) =>
          new RegExp(rewrite.regex).test(path)
        );
        if (routeMatchUnsupportedRewrite) continue;

        const routeMatchUnsupportedRedirect = redirectsNotSupportedByFirebase.some((redirect) =>
          new RegExp(redirect.regex).test(path)
        );
        if (routeMatchUnsupportedRedirect) continue;

        const routeMatchUnsupportedHeader = headersNotSupportedByFirebase.some((header) =>
          new RegExp(header.regex).test(path)
        );
        if (routeMatchUnsupportedHeader) continue;

        // TODO(jamesdaniels) explore oppertunity to simplify this now that we
        //                    are defaulting cleanURLs to true for frameworks

        // / => index.json => index.html => index.html
        // /foo => foo.json => foo.html
        const parts = path
          .split("/")
          .slice(1)
          .filter((it) => !!it);
        const partsOrIndex = parts.length > 0 ? parts : ["index"];
        const dataPath = `${join(...partsOrIndex)}.json`;
        const htmlPath = `${join(...partsOrIndex)}.html`;
        await mkdir(join(destDir, dirname(htmlPath)), { recursive: true });
        const pagesHtmlPath = join(sourceDir, distDir, "server", "pages", htmlPath);
        if (await pathExists(pagesHtmlPath)) {
          await copyFile(pagesHtmlPath, join(destDir, htmlPath));
        } else {
          const appHtmlPath = join(sourceDir, distDir, "server", "app", htmlPath);
          if (await pathExists(appHtmlPath)) {
            await copyFile(appHtmlPath, join(destDir, htmlPath));
          }
        }
        const dataRoute = prerenderManifest.routes[path].dataRoute;
        await mkdir(join(destDir, dirname(dataRoute)), { recursive: true });
        const pagesDataPath = join(sourceDir, distDir, "server", "pages", dataPath);
        if (await pathExists(pagesDataPath)) {
          await copyFile(pagesDataPath, join(destDir, dataRoute));
        } else {
          const appDataPath = join(sourceDir, distDir, "server", "app", dataPath);
          if (await pathExists(appDataPath)) {
            await copyFile(appDataPath, join(destDir, dataRoute));
          }
        }
      }
    }
  }
}

/**
 * Create a directory for SSR content.
 */
export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const { distDir } = await getConfig(sourceDir);
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  if (existsSync(join(sourceDir, "next.config.js"))) {
    let esbuild;
    try {
      esbuild = await import("esbuild");
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      logger.debug(`Failed to load 'esbuild': ${e}`);
      throw new FirebaseError(
        `Unable to find 'esbuild'. Install it into your local dev dependencies with 'npm i --save-dev esbuild''`
      );
    }
    await esbuild.build({
      bundle: true,
      external: Object.keys(packageJson.dependencies),
      absWorkingDir: sourceDir,
      entryPoints: ["next.config.js"],
      outfile: join(destDir, "next.config.js"),
      target: `node${NODE_VERSION}`,
      platform: "node",
    });
  }
  if (await pathExists(join(sourceDir, "public"))) {
    await mkdir(join(destDir, "public"));
    await copy(join(sourceDir, "public"), join(destDir, "public"));
  }
  await mkdirp(join(destDir, distDir));
  await copy(join(sourceDir, distDir), join(destDir, distDir));
  return { packageJson, frameworksEntry: "next.js" };
}

/**
 * Create a dev server.
 */
export async function getDevModeHandle(dir: string) {
  const { default: next } = relativeRequire(dir, "next");
  const nextApp = next({
    dev: true,
    dir,
  });
  const handler = nextApp.getRequestHandler();
  await nextApp.prepare();
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const parsedUrl = parse(req.url!, true);
    const proxy = createServerResponseProxy(req, res, next);
    handler(req, proxy, parsedUrl);
  };
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
  return { distDir: ".next", ...config };
}
