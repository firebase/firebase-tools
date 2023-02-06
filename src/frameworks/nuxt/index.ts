import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { join } from "path";
import { gte } from "semver";
import { findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";
import { warnIfCustomBuildScript } from "../utils";
import { NuxtDependency } from "./interfaces";
import {
  nuxtConfigFilesExist,
  cleanupNuxtDirs,
  loadNuxtManifest,
  writeNuxtManifest,
  overrideEnv,
  clearDir,
} from "./utils";
import { writeTypes } from "./prepare";
import type { EmulatorInfo } from "../../emulator/types";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;

const DEFAULT_BUILD_SCRIPT = ["nuxt build", "nuxi build"];

/**
 *
 * @param dir current directory
 * @return undefined if project is not Nuxt 2, {mayWantBackend: true } otherwise
 */
export async function discover(
  dir: string
): Promise<{ mayWantBackend: true; publicDirectory: string } | undefined> {
  if (!(await pathExists(join(dir, "package.json")))) return;
  const nuxtDependency = findDependency("nuxt", {
    cwd: dir,
    depth: 0,
    omitDev: false,
  }) as NuxtDependency;

  const version = nuxtDependency?.version;
  const anyConfigFileExists = await nuxtConfigFilesExist(dir);

  if (!anyConfigFileExists && !nuxtDependency) return;
  if (version && gte(version, "3.0.0-0")) return { mayWantBackend: true, publicDirectory: "" };

  return;
}

/**
 *
 */
export async function build(root: string) {
  overrideEnv("production");
  const { buildNuxt, loadNuxt, useNitro } = await relativeRequire(root, "@nuxt/kit");

  await warnIfCustomBuildScript(root, name, DEFAULT_BUILD_SCRIPT);

  /**
   * currently genrate is only supported by using nuxi generate or nuxi build --prerender
   * moreover, it is currently still experimental
   */
  const prerender = false;

  const nuxt = await loadNuxt({
    rootDir: root,
    overrides: {
      nitro: { preset: "node" },
      _generate: prerender,
    },
    dotenv: {
      cwd: root,
      fileName: null,
    },
    defaults: {
      experimental: {
        payloadExtraction: prerender ? true : undefined,
      },
    },
  });

  // Use ? for backward compatibility for Nuxt <= RC.10
  const nitro = useNitro?.();

  await clearDir(nuxt.options.buildDir);

  await writeTypes(nuxt);

  nuxt.hook("build:error", (err: any) => {
    console.error("Nuxt Build Error:", err);
    process.exit(1);
  });

  await buildNuxt(nuxt);
  return { wantsBackend: true };
}

/**
 *
 */
export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const distPath = join(root, ".output", "public");
  await copy(distPath, dest);
}

/**
 *
 */
export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  // clean up old files: otherwise could lead to problems
  await clearDir(destDir);
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const outputPackageJsonBuffer = await readFile(
    join(sourceDir, ".output", "server", "package.json")
  );
  const outputPackageJson = JSON.parse(outputPackageJsonBuffer.toString());
  // TODO: this is a hack, firebase ignores bundledDependencies and only uses dependencies -> so dependencies will be removed unintentionally
  outputPackageJson.dependencies = outputPackageJson.bundledDependencies;
  await copy(join(sourceDir, ".output", "server"), destDir);
  return { packageJson: { ...packageJson, ...outputPackageJson }, frameworksEntry: "nuxt3" };
}

/**
 *
 * @param dir
 * @param hostingEmulatorInfo
 * @return node handler for superstatic
 *
 * TODO: currently nuxt dev server does not reload if config files changes (e.g. nuxt.config.ts)
 */
export async function getDevModeHandle(dir: string, hostingEmulatorInfo?: EmulatorInfo) {
  const { setupDotenv } = await relativeRequire(dir, "c12");
  overrideEnv("development");
  await setupDotenv({ cwd: dir, fileName: null });
  const { loadNuxt, buildNuxt } = await relativeRequire(dir, "@nuxt/kit");
  const { toNodeListener } = await relativeRequire(dir, "h3");

  const currentNuxt = await loadNuxt({ rootDir: dir, dev: true, ready: false });

  const previousManifest = await loadNuxtManifest(currentNuxt.options.buildDir);
  const newManifest = await writeNuxtManifest(currentNuxt);
  if (previousManifest && newManifest && previousManifest._hash !== newManifest._hash) {
    await cleanupNuxtDirs(currentNuxt.options.rootDir);
  }

  await currentNuxt.ready();
  // Todo: check if this hook is needed for some nuxt3 modules and if so, how to implement it with firebase/superstatic
  // await currentNuxt.hooks.callHook('listen', null, { url: 'http://localhost:5000/' });

  currentNuxt.options.devServer.url = `http://${hostingEmulatorInfo?.host}:${hostingEmulatorInfo?.port}/`;
  currentNuxt.options.devServer.port = hostingEmulatorInfo?.port ?? 5000;
  currentNuxt.options.devServer.host = hostingEmulatorInfo?.host ?? "::";
  currentNuxt.options.devServer.https = false;

  await Promise.all([writeTypes(currentNuxt).catch(console.error), buildNuxt(currentNuxt)]);
  const handler = toNodeListener(currentNuxt.server.app);

  return handler;
}
