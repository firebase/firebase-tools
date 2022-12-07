/* eslint-disable */
//
import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { basename, join } from "path";
import { gte, lt } from "semver";
import { BuildResult, findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";

export const name = "Nuxt 2";
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
  if (lt(version, "3.0.0")) return { mayWantBackend: true };

  return;
}

export async function build(root: string) {
  const nuxt = await getNuxtApp(root);

  const nuxtApp = await nuxt.loadNuxt({
    for: "build",
    rootDir: root,
  });

  // const deployPath = (...args: string[]) => join(config.dist, ...args);

  const {
    options: {
      target,
      app: { basePath, assetsPath },
      buildDir,
      dir: { static: staticDir },
    },
  } = await nuxt.build(nuxtApp);

  // console.log("----> build(): nuxt:", nuxt);
  console.log("----> build(): target:", target);
  console.log("----> build(): basePath:", basePath);
  console.log("----> build(): assetsPath:", assetsPath);
  console.log("----> build(): buildDir:", buildDir);
  console.log("----> build(): staticDir:", staticDir);

  if (target === "static") {
    const nuxtApp = await nuxt.loadNuxt({
      for: "start",
      rootDir: root,
    });

    const builder = await nuxt.getBuilder(nuxtApp);
    const generator = new nuxt.Generator(nuxtApp, builder);
    await generator.generate({ build: false, init: true });
  } else {
    // TODO: Maybe copy the server directory here instead of `ɵcodegenFunctionsDirectory`
    // TODO: `buildDir` can be leveraged instead of hardcoding `.nuxt`
    return { wantsBackend: true };
  }

  return;
}

/**
 * Get the Nuxt app
 * @param cwd
 * @return Nuxt app object
 */
async function getNuxtApp(cwd: string) {
  let nuxt: any = null;
  try {
    // @ts-ignore
    nuxt = await relativeRequire(cwd, "nuxt/dist/nuxt.js");
  } catch (e) {
    return null;
  }

  return nuxt;
}

/**
 * Copy the static files to the destination directory whether it's a static build or server build.
 * @param root
 * @param dest
 */
export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const nuxt = await getNuxtApp(root);
  const nuxtConfig = nuxt.loadNuxtConfig();

  console.log("---> ɵcodegenPublicDirectory(): nuxtConfig:", nuxtConfig);

  // TODO this folder may be `src/dist` for static build (nuxt generate) or `src/.nuxt/dist/client` for server build (nuxt build)
  if (nuxtConfig.target === "static") {
    const distPath = join(root, "dist");
    await copy(distPath, dest);
  } else {
    // TODO: this seems to be missing the `index.html` file that's generated in the `dist` folder
    const distPath = join(root, ".nuxt", "dist", "client");
    await copy(distPath, join(dest, "_nuxt"));
  }
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  await copy(join(sourceDir, ".nuxt", "dist", "server"), destDir);
  await copy(join(sourceDir, ".nuxt"), join(destDir, ".nuxt"));

  return { packageJson: { ...packageJson }, frameworksEntry: "nuxt" };
}
