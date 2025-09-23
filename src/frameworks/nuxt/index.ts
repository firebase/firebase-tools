import { copy, mkdirp, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { join, posix } from "path";
import { lt } from "semver";
import { spawn, sync as spawnSync } from "cross-spawn";
import { FrameworkType, SupportLevel } from "../interfaces";
import { simpleProxy, warnIfCustomBuildScript, getNodeModuleBin, relativeRequire } from "../utils";
import { getNuxtVersion } from "./utils";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;
export const supportedRange = "3";

import { nuxtConfigFilesExist } from "./utils";
import type { NuxtOptions } from "./interfaces";
import { FirebaseError } from "../../error";
import { execSync } from "child_process";

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

export async function build(cwd: string) {
  await warnIfCustomBuildScript(cwd, name, DEFAULT_BUILD_SCRIPT);
  const cli = getNodeModuleBin("nuxt", cwd);
  const {
    ssr: wantsBackend,
    app: { baseURL: baseUrl },
  } = await getConfig(cwd);
  const command = wantsBackend ? ["build"] : ["generate"];
  const build = spawnSync(cli, command, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NITRO_PRESET: "node" },
  });
  if (build.status !== 0) throw new FirebaseError("Was unable to build your Nuxt application.");
  const rewrites = wantsBackend
    ? []
    : [
        {
          source: posix.join(baseUrl, "**"),
          destination: posix.join(baseUrl, "200.html"),
        },
      ];
  return { wantsBackend, rewrites, baseUrl };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const {
    app: { baseURL },
  } = await getConfig(root);
  const distPath = join(root, ".output", "public");
  const fullDest = join(dest, baseURL);
  await mkdirp(fullDest);
  await copy(distPath, fullDest);
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string) {
  const serverDir = join(sourceDir, ".output", "server");
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  packageJson.dependencies ||= {};
  packageJson.dependencies["nitro-output"] = `file:${serverDir}`;

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
  execSync(`npx --yes nuxi@"${supportedRange}" init ${setup.hosting.source}`, {
    stdio: "inherit",
    cwd: config.projectDir,
  });
  return Promise.resolve();
}
