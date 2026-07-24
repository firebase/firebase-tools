import { execSync } from "child_process";
import { spawn, sync as spawnSync } from "cross-spawn";
import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { load } from "js-yaml";
import { join } from "path";
import { lt } from "semver";
import { FirebaseError } from "../../error";
import {
  BuildResult,
  BundleConfig,
  Framework,
  FrameworkType,
  PackageJson,
  SupportLevel,
} from "../interfaces";
import {
  getNodeModuleBin,
  readJSON,
  relativeRequire,
  simpleProxy,
  warnIfCustomBuildScript,
} from "../utils";
import type { NuxtOptions } from "./interfaces";
import { getNuxtVersion, nuxtConfigFilesExist } from "./utils";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;
export const supportedRange = "3";

const DEFAULT_BUILD_SCRIPT = ["nuxt build", "nuxi build"];

/**
 *
 * @param dir current directory
 * @return undefined if project is not Nuxt 2, { mayWantBackend: true, publicDirectory: string } otherwise
 */
export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;

  const anyConfigFileExists = await nuxtConfigFilesExist(dir);

  const version = getNuxtVersion(dir);
  if (!anyConfigFileExists && !version) return;
  if (version && lt(version, "3.0.0-0")) return;

  const { ssr: mayWantBackend } = await getConfig(dir);

  return { mayWantBackend, version };
}

let bundleConfig: BundleConfig;
async function getBundleConfig(cwd: string): Promise<BundleConfig> {
  if (!bundleConfig) {
    const fileContents = await readFile(join(cwd, ".apphosting", "bundle.yaml"), "utf8");
    bundleConfig = load(fileContents) as BundleConfig;
  }

  return bundleConfig;
}

/**
 * Builds a Nuxt application
 */
export async function build(cwd: string): Promise<BuildResult> {
  await warnIfCustomBuildScript(cwd, name, DEFAULT_BUILD_SCRIPT);

  const build = spawnSync("npx", ["@apphosting/adapter-nuxt", "build"], { cwd, stdio: "inherit" });
  if (build.status !== 0) throw new FirebaseError("Was unable to build your Nuxt application.");

  const { rewrites, serverDirectory } = await getBundleConfig(cwd);

  return { wantsBackend: Boolean(serverDirectory), rewrites };
}

/**
 * Create a directory for SSG content
 */
export async function ɵcodegenPublicDirectory(
  root: string,
  dest: string,
): ReturnType<NonNullable<Framework["ɵcodegenPublicDirectory"]>> {
  const bundleConfig = await getBundleConfig(root);

  await Promise.all(bundleConfig.staticAssets.map((assetPath) => copy(assetPath, dest)));
}

/**
 * Create a directory for SSR content
 */
export async function ɵcodegenFunctionsDirectory(
  sourceDir: string,
): ReturnType<NonNullable<Framework["ɵcodegenFunctionsDirectory"]>> {
  const packageJson = await readJSON<PackageJson>(join(sourceDir, "package.json"));
  packageJson.dependencies ||= {};

  const { serverDirectory } = await getBundleConfig(sourceDir);

  if (serverDirectory) {
    packageJson.dependencies["nitro-output"] = `file:${join(serverDirectory)}`;
  }

  return { packageJson, frameworksEntry: "nitro" };
}

export async function getDevModeHandle(cwd: string) {
  const host = new Promise<string>((resolve, reject) => {
    const cli = getNodeModuleBin("nuxt", cwd);
    const serve = spawn(cli, ["dev"], { cwd: cwd });

    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/.+:\d+)/);

      if (match) resolve(match[1]);
    });

    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });

    serve.on("exit", reject);
  });

  return simpleProxy(await host);
}

export async function getConfig(cwd: string): Promise<NuxtOptions> {
  const { loadNuxtConfig } = await relativeRequire(cwd, "@nuxt/kit");

  return await loadNuxtConfig({ cwd });
}

/**
 * Utility method used during project initialization.
 */
export function init(setup: any, config: any) {
  execSync(`npx --yes nuxi@"${supportedRange}" init ${setup.featureInfo.hosting.source}`, {
    stdio: "inherit",
    cwd: config.projectDir,
  });
  return Promise.resolve();
}
