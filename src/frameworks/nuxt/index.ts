import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { basename, join } from "path";
import { gte } from "semver";
import { BuildResult, findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";

export const name = "Nuxt";
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Toolchain;

export async function discover(dir: string) {
  if (!(await pathExists(join(dir, "package.json")))) return;
  const nuxtDependency = findDependency("nuxt", { cwd: dir, depth: 0, omitDev: false });
  const configFilesExist = await Promise.all([
    pathExists(join(dir, "nuxt.config.js")),
    pathExists(join(dir, "nuxt.config.ts")),
  ]);
  const anyConfigFileExists = configFilesExist.some((it) => it);
  if (!anyConfigFileExists && !nuxtDependency) return;
  return { mayWantBackend: true };
}

export async function build(root: string): Promise<BuildResult> {
  const { buildNuxt } = await relativeRequire(root, "@nuxt/kit");
  const nuxtApp = await getNuxtApp(root);
  await buildNuxt(nuxtApp);
  return { wantsBackend: true };
}

async function getNuxtApp(cwd: string) {
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

function isNuxt3(cwd: string) {
  const { version } = findDependency("nuxt", { cwd, depth: 0, omitDev: false });
  return gte(version, "3.0.0-0");
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const app = await getNuxtApp(root);
  const distPath = isNuxt3(root) ? join(root, ".output", "public") : app.options.generate.dir;
  await copy(distPath, dest);
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  if (isNuxt3(sourceDir)) {
    const outputPackageJsonBuffer = await readFile(
      join(sourceDir, ".output", "server", "package.json")
    );
    const outputPackageJson = JSON.parse(outputPackageJsonBuffer.toString());
    await copy(join(sourceDir, ".output", "server"), destDir);
    return { packageJson: { ...packageJson, ...outputPackageJson }, frameworksEntry: "nuxt3" };
  } else {
    const {
      options: { buildDir },
    } = await getNuxtApp(sourceDir);
    await copy(buildDir, join(destDir, basename(buildDir)));
    return { packageJson };
  }
}
