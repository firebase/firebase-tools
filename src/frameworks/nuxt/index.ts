import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { join } from "path";
import { lt } from "semver";
import { spawn } from "cross-spawn";
import { FrameworkType, getNodeModuleBin, relativeRequire, SupportLevel } from "..";
import { simpleProxy, warnIfCustomBuildScript } from "../utils";
import { getNuxtVersion } from "./utils";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;

import { nuxtConfigFilesExist } from "./utils";
import type { NuxtOptions } from "./interfaces";

const DEFAULT_BUILD_SCRIPT = ["nuxt build", "nuxi build"];

/**
 *
 * @param dir current directory
 * @return undefined if project is not Nuxt 2, { mayWantBackend: true, publicDirectory: string } otherwise
 */
export async function discover(
  dir: string
): Promise<{ mayWantBackend: true; publicDirectory: string } | undefined> {
  if (!(await pathExists(join(dir, "package.json")))) return;

  const anyConfigFileExists = await nuxtConfigFilesExist(dir);

  const nuxtVersion = getNuxtVersion(dir);
  if (!anyConfigFileExists && !nuxtVersion) return;
  if (nuxtVersion && lt(nuxtVersion, "3.0.0-0")) return;

  const {
    dir: { public: publicDirectory },
  } = await getConfig(dir);

  return { publicDirectory, mayWantBackend: true };
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

export async function getDevModeHandle(cwd: string) {
  const host = new Promise<string>((resolve) => {
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
  });

  return simpleProxy(await host);
}

export async function getConfig(dir: string): Promise<NuxtOptions> {
  const { loadNuxtConfig } = await relativeRequire(dir, "@nuxt/kit");
  return await loadNuxtConfig(dir);
}
