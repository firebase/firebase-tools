import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { join } from "path";
import { gte } from "semver";
import { findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";
import { warnIfCustomBuildScript } from "../utils";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;

import { NuxtDependency } from "./interfaces";
import { nuxtConfigFilesExist, overrideEnv, clearDir } from "./utils";
import { writeTypes } from "./prepare";

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
 * @param root directory of nuxt app
 * @returns options if backend is wanted
 */
export async function build(root: string) {
  overrideEnv("production");
  const { loadNuxt, buildNuxt, useNitro } = await relativeRequire(root, "@nuxt/kit");

  await warnIfCustomBuildScript(root, name, DEFAULT_BUILD_SCRIPT);

  const nuxt = await loadNuxt({
    rootDir: root,
    overrides: {
      nitro: { preset: "node" }
    },
    dotenv: {
      cwd: root,
      fileName: null,
    }
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
 * Copy the static files to the destination directory.
 * @param root
 * @param dest
 */
export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  //public directory of nuxt app, currently not configurable
  const distPath = join(root, ".output", "public");
  await copy(distPath, dest);
}

/**
 * Copy the server files to the destination directory.
 * @param sourceDir
 * @param destDir
 * @returns package.json and frameworksEntry
 * 
 */
export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  // clean up old files: otherwise could lead to problems
  await clearDir(destDir);
  // server directory of nuxt app, currently not configurable
  const serverDir = join(sourceDir, ".output", "server");

  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const outputPackageJsonBuffer = await readFile(
    join(serverDir, "package.json")
  );
  const outputPackageJson = JSON.parse(outputPackageJsonBuffer.toString());
  // build system of nuxt adds dependencies as bundledDependencies to package.json so we have to add them to dependencies
  outputPackageJson.dependencies = outputPackageJson?.bundledDependencies || {};
  if (outputPackageJson?.bundledDependencies)  delete outputPackageJson.bundledDependencies;

  await copy(join(serverDir), destDir);
  return { packageJson: { ...packageJson, ...outputPackageJson }, frameworksEntry: "nuxt3" };
}