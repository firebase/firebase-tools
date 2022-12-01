/* eslint-disable */
//
import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { basename, join } from "path";
import { gte } from "semver";
import { BuildResult, findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";

export const name = "Nuxt 3";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;
  const nuxtDependency = findDependency("nuxt", { cwd: dir, depth: 0, omitDev: false });
  const version = nuxtDependency?.version;
  const configFilesExist = await Promise.all([
    pathExists(join(dir, "nuxt.config.js")),
    pathExists(join(dir, "nuxt.config.ts")),
  ]);

  const anyConfigFileExists = configFilesExist.some((it) => it);
  if (!anyConfigFileExists && !nuxtDependency) return;
  if (!version) throw new Error("Unable to find the nuxt dep.");
  if (gte(version, "3.0.0")) return { mayWantBackend: true };

  return;
}

export async function build(root: string) {
  const { buildNuxt } = await relativeRequire(root, "@nuxt/kit");
  const nuxtApp = await getNuxt3App(root);
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
  // const app = await getNuxt3App(root);
  // app.options.generate.dir;
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

  // const {
  //   options: { buildDir },
  // } = await getNuxt3App(sourceDir);
  // await copy(buildDir, join(destDir, basename(buildDir)));
  // return { packageJson };
}
