import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { basename, join } from "path";
import { gte } from "semver";
import { BuildResult, findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";

export const name = "Nuxt";
export const support = SupportLevel.Expirimental;
export const type = FrameworkType.Toolchain;

export const discover = async (dir: string) => {
  if (!(await pathExists(join(dir, "package.json")))) return undefined;
  const nuxtDependency = findDependency("nuxt", { cwd: dir, depth: 0, omitDev: false });
  const configFilesExist = await Promise.all([
    pathExists(join(dir, "nuxt.config.js")),
    pathExists(join(dir, "nuxt.config.ts")),
  ]);
  const anyConfigFileExists = configFilesExist.some((it) => it);
  if (!anyConfigFileExists && !nuxtDependency) return undefined;
  return { mayWantBackend: true };
};

export const build = async (root: string): Promise<BuildResult> => {
  const { buildNuxt } = await relativeRequire(root, "@nuxt/kit");
  const nuxtApp = await getNuxtApp(root);
  await buildNuxt(nuxtApp);
  return { wantsBackend: true };
};

const getNuxtApp = async (cwd: string) => {
  const { loadNuxt } = await relativeRequire(cwd, "@nuxt/kit");
  return await loadNuxt({
    cwd,
    overrides: {
      nitro: { preset: "node" },
      //    _generate: true,
    },
  });
};

const isNuxt3 = (cwd: string) => {
  const { version } = findDependency("nuxt", { cwd, depth: 0, omitDev: false });
  return gte(version, "3.0.0-0");
};

export const ɵcodegenPublicDirectory = async (root: string, dest: string) => {
  const app = await getNuxtApp(root);
  const distPath = isNuxt3(root) ? join(root, ".output", "public") : app.options.generate.dir;
  await copy(distPath, dest);
};

export const ɵcodegenFunctionsDirectory = async (sourceDir: string, destDir: string) => {
  if (isNuxt3(sourceDir)) {
    const packageJsonBuffer = await readFile(join(sourceDir, ".output", "server", "package.json"));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    /* for (const bundledDep of packageJson.bundledDependencies) {
            packageJson.overrides ||= {};
            packageJson.overrides[bundledDep] = `./bundled_node_modules/${bundledDep}`;
        }
        delete packageJson.bundledDependencies;*/

    /* const outputFiles = await readdir(join(sourceDir, '.output', 'server'));
        for (const file of outputFiles) {
            await copy(join(sourceDir, '.output', 'server', file), join(destDir, file === 'node_modules' ? 'bundled_node_modules' : file));
        }*/
    await copy(join(sourceDir, ".output", "server"), destDir);

    return { packageJson, frameworksEntry: "nuxt3" };
  } else {
    const {
      options: { buildDir },
    } = await getNuxtApp(sourceDir);
    await copy(buildDir, join(destDir, basename(buildDir)));
    const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    return { packageJson };
  }
};
