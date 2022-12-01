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
  const { nuxt, nuxtApp } = await getNuxtApp(root);

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

  let usingCloudFunctions = false;
  if (target === "static") {
    const nuxtApp = await nuxt.loadNuxt({
      for: "start",
      rootDir: root,
    });

    // TODO: DON'T THINK THIS IS NEEDED
    // await nuxtApp.server.listen(0);

    const builder = await nuxt.getBuilder(nuxtApp);
    const generator = new nuxt.Generator(nuxtApp, builder);
    await generator.generate({ build: false, init: true });

    // TODO: DON'T THINK THIS IS NEEDED
    // await nuxtApp.server.close();

    usingCloudFunctions = !generator.isFullStatic;
  } else {
    // await copy(join(buildDir, "dist", "client"), deployPath("hosting", assetsPath));
    // await copy(getProjectPath(staticDir), deployPath("hosting"));
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
    return { nuxt: null, nuxtApp: null };
  }

  const nuxtApp = await nuxt.loadNuxt({
    for: "build",
    rootDir: cwd,
  });

  return { nuxt, nuxtApp };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const distPath = join(root, "dist");
  await copy(distPath, dest);
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  console.log("----> ɵcodegenFunctionsDirectory() called");
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  // if (isNuxt3(sourceDir)) {
  //   const outputPackageJsonBuffer = await readFile(
  //     join(sourceDir, ".output", "server", "package.json")
  //   );
  //   const outputPackageJson = JSON.parse(outputPackageJsonBuffer.toString());
  //   await copy(join(sourceDir, ".output", "server"), destDir);
  //   return { packageJson: { ...packageJson, ...outputPackageJson }, frameworksEntry: "nuxt3" };
  // } else {
  //   const {
  //     options: { buildDir },
  //   } = await getNuxt3App(sourceDir);
  //   await copy(buildDir, join(destDir, basename(buildDir)));
  //   return { packageJson };
  // }
}
