/* eslint-disable */
import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { join } from "path";
import { gte } from "semver";
import type { NuxtOptions } from "@nuxt/schema";
import { spawn } from "cross-spawn";
import { findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";
import { warnIfCustomBuildScript } from "../utils";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;

import { NuxtDependency } from "./interfaces";
import { nuxtConfigFilesExist } from "./utils";
import { EmulatorInfo } from "../../emulator/types";
import { proxyRequestHandler } from "../../hosting/proxy";

const DEFAULT_BUILD_SCRIPT = ["nuxt build"];
const CLI_COMMAND = join("node_modules", ".bin", "nuxt");

/**
 *
 * @param dir current directory
 * @return undefined if project is not Nuxt 2, {mayWantBackend: true } otherwise
 */
export async function discover(
  dir: string
): Promise<{ mayWantBackend?: true; publicDirectory: string }> {
  const {
    dir: { public: publicDirectory },
  } = await getConfig(dir);

  if (!(await pathExists(join(dir, "package.json")))) return { publicDirectory };

  const nuxtDependency = findDependency("nuxt", {
    cwd: dir,
    depth: 0,
    omitDev: false,
  }) as NuxtDependency;

  const version = nuxtDependency?.version;
  const anyConfigFileExists = await nuxtConfigFilesExist(dir);

  if (!anyConfigFileExists && !nuxtDependency) return { publicDirectory };
  if (version && gte(version, "3.0.0-0")) return { publicDirectory, mayWantBackend: true };

  return { publicDirectory };
}

export async function build(root: string) {
  const { buildNuxt } = await relativeRequire(root, "@nuxt/kit");
  const nuxtApp = await getNuxt3App(root);

  await warnIfCustomBuildScript(root, name, DEFAULT_BUILD_SCRIPT);

  await buildNuxt(nuxtApp);
  return { wantsBackend: true };
}

// Nuxt 3
async function getNuxt3App(cwd: string) {
  const { loadNuxt } = await relativeRequire(cwd, "@nuxt/kit");
  return await loadNuxt({
    cwd,
    overrides: {
      nitro: { preset: "node" },
      // TODO figure out why generate true is leading to errors
      // _generate: true,
    },
  });
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const distPath = join(root, ".output", "public");
  await copy(distPath, dest);
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  const outputPackageJsonBuffer = await readFile(
    join(sourceDir, ".output", "server", "package.json")
  );
  const outputPackageJson = JSON.parse(outputPackageJsonBuffer.toString());
  await copy(join(sourceDir, ".output", "server"), destDir);
  return { packageJson: { ...packageJson, ...outputPackageJson }, frameworksEntry: "nuxt3" };
}

export async function getDevModeHandle(dir: string, hostingEmulatorInfo?: EmulatorInfo) {
  const host = new Promise<string>((resolve) => {
    // Can't use scheduleTarget since that—like prerender—is failing on an ESM bug
    // will just grep for the hostname
    const serve = spawn(CLI_COMMAND, ["dev"], { cwd: dir });

    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/.+:\d+)/);

      if (match) resolve(match[1]);
    });

    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });
  });

  return proxyRequestHandler(await host, "Nuxt Development Server", { forceCascade: true });
}

async function getConfig(dir: string): Promise<NuxtOptions> {
  const { loadNuxtConfig } = await relativeRequire(dir, "@nuxt/kit");
  const config: NuxtOptions = await loadNuxtConfig(dir);

  return config;
}
