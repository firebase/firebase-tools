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

import { nuxtConfigFilesExist } from "./utils";
import type { NuxtOptions } from "./interfaces";
import { FirebaseError } from "../../error";

const DEFAULT_BUILD_SCRIPT = ["nuxt build", "nuxi build"];

/**
 *
 * @param dir current directory
 * @return undefined if project is not Nuxt 2, { mayWantBackend: true, publicDirectory: string } otherwise
 */
export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;

  const anyConfigFileExists = await nuxtConfigFilesExist(dir);

  const nuxtVersion = getNuxtVersion(dir);
  if (!anyConfigFileExists && !nuxtVersion) return;
  if (nuxtVersion && lt(nuxtVersion, "3.0.0-0")) return;

  const {
    dir: { public: publicDirectory },
    ssr: mayWantBackend,
  } = await getConfig(dir);

  return { publicDirectory, mayWantBackend };
}

export async function build(cwd: string) {
  await warnIfCustomBuildScript(cwd, name, DEFAULT_BUILD_SCRIPT);
  const cli = getNodeModuleBin("nuxt", cwd);
  const {
    ssr: wantsBackend,
    app: { baseURL },
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
          source: posix.join(baseURL, "**"),
          destination: posix.join(baseURL, "200.html"),
        },
      ];
  return { wantsBackend, rewrites };
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

  const {
    app: { baseURL: baseUrl },
  } = await getConfig(sourceDir);

  return { packageJson, frameworksEntry: "nitro", baseUrl };
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
