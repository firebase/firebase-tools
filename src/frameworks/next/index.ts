import { execSync } from "child_process";
import { readFile, mkdir, copyFile, stat } from "fs/promises";
import { dirname, extname, join } from "path";
import type { Header, Rewrite, Redirect } from "next/dist/lib/load-custom-routes";
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

// Next.js's exposed interface is incomplete here
// TODO see if there's a better way to grab this
interface Manifest {
  distDir?: string;
  basePath?: string;
  headers?: (Header & { regex: string })[];
  redirects?: (Redirect & { regex: string })[];
  rewrites?:
    | (Rewrite & { regex: string })[]
    | {
        beforeFiles?: (Rewrite & { regex: string })[];
        afterFiles?: (Rewrite & { regex: string })[];
        fallback?: (Rewrite & { regex: string })[];
      };
}

const CLI_COMMAND = join(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

export const name = "Next.js";
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.MetaFramework;

function getNextVersion(cwd: string) {
  return findDependency("next", { cwd, depth: 0, omitDev: false })?.version;
}

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;
  if (!(await pathExists("next.config.js")) && !getNextVersion(dir)) return;
  // TODO don't hardcode public dir
  return { mayWantBackend: true, publicDirectory: join(dir, "public") };
}

export async function build(dir: string): Promise<BuildResult> {
  const { default: nextBuild } = relativeRequire(dir, "next/dist/build");

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
    const unrenderedPages = Object.keys(pagesManifestJSON).filter(
      (it) =>
        !(
          ["/_app", "/_error", "/_document", "/404"].includes(it) ||
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
  const manifest: Manifest = JSON.parse(manifestBuffer.toString());
  const {
    headers: nextJsHeaders = [],
    redirects: nextJsRedirects = [],
    rewrites: nextJsRewrites = [],
  } = manifest;
  const headers = nextJsHeaders.map(({ source, headers }) => ({ source, headers }));
  const redirects = nextJsRedirects
    .filter(({ internal }: any) => !internal)
    .map(({ source, destination, statusCode: type }) => ({ source, destination, type }));
  const nextJsRewritesToUse = Array.isArray(nextJsRewrites)
    ? nextJsRewrites
    : nextJsRewrites.beforeFiles || [];
  const rewrites = nextJsRewritesToUse
    .map(({ source, destination, has }) => {
      // Can we change i18n into Firebase settings?
      if (has) return undefined;
      return { source, destination };
    })
    .filter((it) => it);

  return { wantsBackend, headers, redirects, rewrites };
}

export async function init(setup: any) {
  const language = await promptOnce({
    type: "list",
    default: "JavaScript",
    message: "What language would you like to use?",
    choices: ["JavaScript", "TypeScript"],
  });
  execSync(
    `npx --yes create-next-app@latest ${setup.hosting.source} ${
      language === "TypeScript" ? "--ts" : ""
    }`,
    { stdio: "inherit" }
  );
}

export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  const { distDir } = await getConfig(sourceDir);
  const exportDetailPath = join(sourceDir, distDir, "export-detail.json");
  const exportDetailExists = await pathExists(exportDetailPath);
  const exportDetailBuffer = exportDetailExists ? await readFile(exportDetailPath) : undefined;
  const exportDetailJson = exportDetailBuffer && JSON.parse(exportDetailBuffer.toString());
  if (exportDetailJson?.success) {
    copy(exportDetailJson.outDirectory, destDir);
  } else {
    await mkdir(join(destDir, "_next", "static"), { recursive: true });
    await copy(join(sourceDir, "public"), destDir);
    await copy(join(sourceDir, distDir, "static"), join(destDir, "_next", "static"));

    const serverPagesDir = join(sourceDir, distDir, "server", "pages");
    await copy(serverPagesDir, destDir, {
      filter: async (filename) => {
        const status = await stat(filename);
        if (status.isDirectory()) return true;
        return extname(filename) === ".html";
      },
    });

    const prerenderManifestBuffer = await readFile(
      join(sourceDir, distDir, "prerender-manifest.json")
    );
    const prerenderManifest = JSON.parse(prerenderManifestBuffer.toString());
    // TODO drop from hosting if revalidate
    for (const route in prerenderManifest.routes) {
      if (prerenderManifest.routes[route]) {
        // / => index.json => index.html => index.html
        // /foo => foo.json => foo.html
        const parts = route
          .split("/")
          .slice(1)
          .filter((it) => !!it);
        const partsOrIndex = parts.length > 0 ? parts : ["index"];
        const dataPath = `${join(...partsOrIndex)}.json`;
        const htmlPath = `${join(...partsOrIndex)}.html`;
        await mkdir(join(destDir, dirname(htmlPath)), { recursive: true });
        await copyFile(
          join(sourceDir, distDir, "server", "pages", htmlPath),
          join(destDir, htmlPath)
        );
        const dataRoute = prerenderManifest.routes[route].dataRoute;
        await mkdir(join(destDir, dirname(dataRoute)), { recursive: true });
        await copyFile(
          join(sourceDir, distDir, "server", "pages", dataPath),
          join(destDir, dataRoute)
        );
      }
    }
  }
}

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
  await mkdir(join(destDir, "public"));
  await mkdirp(join(destDir, distDir));
  await copy(join(sourceDir, "public"), join(destDir, "public"));
  await copy(join(sourceDir, distDir), join(destDir, distDir));
  return { packageJson, frameworksEntry: "next.js" };
}

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
