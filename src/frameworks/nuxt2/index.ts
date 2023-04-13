import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { join } from "path";
import { lt } from "semver";
import { FrameworkType, relativeRequire, SupportLevel } from "..";

import { nuxtConfigFilesExist, getNuxtVersion } from "../nuxt/utils";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;

/**
 *
 * @param dir current directory
 * @return undefined if project is not Nuxt 2, {mayWantBackend: true } otherwise
 */
export async function discover(dir: string): Promise<{ mayWantBackend: true } | undefined> {
  if (!(await pathExists(join(dir, "package.json")))) return;

  const nuxtVersion = getNuxtVersion(dir);
  const anyConfigFileExists = await nuxtConfigFilesExist(dir);

  if (!anyConfigFileExists && !nuxtVersion) return;
  if (nuxtVersion && lt(nuxtVersion, "3.0.0-0")) return { mayWantBackend: true };
}

/**
 * Get the Nuxt app
 * @param cwd
 * @return Nuxt app object
 */
async function getNuxtApp(cwd: string): Promise<any> {
  return await relativeRequire(cwd, "nuxt/dist/nuxt.js");
}

/**
 *
 * @param root nuxt project root
 * @return whether backend is needed or not
 */
export async function build(root: string): Promise<{ wantsBackend: boolean }> {
  const nuxt = await getNuxtApp(root);

  const nuxtApp = await nuxt.loadNuxt({
    for: "build",
    rootDir: root,
  });

  const {
    options: { ssr, target },
  } = await nuxt.build(nuxtApp);

  if (ssr === true && target === "server") {
    return { wantsBackend: true };
  } else {
    // Inform the user that static target is not supported with `ssr: false`,
    // and continue with building for client side as per current Nuxt 2.
    if (ssr === false && target === "static") {
      console.log(
        "Firebase: Nuxt 2: Static target is not supported with `ssr: false`. Please use `target: 'server'` in your `nuxt.config.js` file."
      );
      console.log("Firebase: Nuxt 2: Bundling only for client side.\n");
    }

    await buildAndGenerate(nuxt, root);
    return { wantsBackend: false };
  }
}
/**
 * Build and generate the Nuxt app
 *
 * @param nuxt nuxt object
 * @param root root directory
 * @return void
 */
async function buildAndGenerate(nuxt: any, root: string): Promise<void> {
  const nuxtApp = await nuxt.loadNuxt({
    for: "start",
    rootDir: root,
  });

  const builder = await nuxt.getBuilder(nuxtApp);
  const generator = new nuxt.Generator(nuxtApp, builder);
  await generator.generate({ build: false, init: true });
}

/**
 * Copy the static files to the destination directory whether it's a static build or server build.
 * @param root
 * @param dest
 */
export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const nuxt = await getNuxtApp(root);
  const nuxtConfig = await nuxt.loadNuxtConfig();
  const { ssr, target } = nuxtConfig;

  // If `target` is set to `static`, copy the generated files
  // to the destination directory (i.e. `/hosting`).
  if (!(ssr === true && target === "server")) {
    const source =
      nuxtConfig?.generate?.dir !== undefined
        ? join(root, nuxtConfig?.generate?.dir)
        : join(root, "dist");

    await copy(source, dest);
  }

  // Copy static assets if they exist.
  const staticPath = join(root, "static");
  if (await pathExists(staticPath)) {
    await copy(staticPath, dest);
  }
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  // Get the nuxt config into an object so we can check the `target` and `ssr` properties.
  const nuxt = await getNuxtApp(sourceDir);
  const nuxtConfig = await nuxt.loadNuxtConfig();

  // When starting the Nuxt 2 server, we need to copy the `.nuxt` to the destination directory (`functions`)
  // with the same folder name (.firebase/<project-name>/functions/.nuxt).
  // This is because `loadNuxt` (called from `firebase-frameworks`) will only look
  // for the `.nuxt` directory in the destination directory.
  await copy(join(sourceDir, ".nuxt"), join(destDir, ".nuxt"));

  // When using `SSR: false`, we need to copy the `nuxt.config.js` to the destination directory (`functions`)
  // This is because `loadNuxt` (called from `firebase-frameworks`) will look
  // for the `nuxt.config.js` file in the destination directory.
  if (!nuxtConfig.ssr) {
    const nuxtConfigFile = nuxtConfig._nuxtConfigFile.split("/").pop();
    await copy(nuxtConfig._nuxtConfigFile, join(destDir, nuxtConfigFile));
  }

  return { packageJson: { ...packageJson }, frameworksEntry: "nuxt" };
}
