import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { join } from "path";
import { lt } from "semver";
import { findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";

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
  const nuxt = await getNuxtAppForBuild(root);

  const nuxtApp = await nuxt.loadNuxt({
    for: "build",
    rootDir: root,
  });

  const {
    options: { target },
  } = await nuxt.build(nuxtApp);

  if (target === "static") {
    const nuxtApp = await nuxt.loadNuxt({
      for: "start",
      rootDir: root,
    });

    const builder = await nuxt.getBuilder(nuxtApp);
    const generator = new nuxt.Generator(nuxtApp, builder);
    await generator.generate({ build: false, init: true });
  } else {
    return { wantsBackend: true };
  }

  return;
}

/**
 * Get the Nuxt app
 * @param cwd
 * @return Nuxt app object
 */
async function getNuxtAppForBuild(cwd: string) {
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
  const nuxt = await getNuxtAppForBuild(root);
  const nuxtConfig = await nuxt.loadNuxtConfig();

  /*
		If `target` is set to `static`, copy the generated files to the destination directory (i.e. `/hosting`).
	*/
  if (nuxtConfig.target === "static") {
    await copy(
      nuxtConfig?.generate.dir ? join(root, nuxtConfig?.generate.dir) : join(root, "dist"),
      dest
    );
  }

  /*
		Copy static assets if they exist.
	*/
  const staticPath = join(root, "static");
  if (await pathExists(staticPath)) {
    await copy(staticPath, dest);
  }
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  /*
		Get the nuxt config into an object so we can check the `target` and `ssr` properties.
	*/
  const nuxt = await getNuxtAppForBuild(sourceDir);
  const nuxtConfig = await nuxt.loadNuxtConfig();

  /*
		When starting the Nuxt 2 server, we need to copy the `.nuxt` to the destination directory (`functions`)
		with the same folder name (.firebase/<project-name>/functions/.nuxt).
		This is because `loadNuxt` (called from `firebase-frameworks`) will only look
		for the `.nuxt` directory in the destination directory.
	*/
  await copy(join(sourceDir, ".nuxt"), join(destDir, ".nuxt"));

  /*
		When using `SSR: false`, we need to copy the `nuxt.config.js` to the destination directory (`functions`)
		This is because `loadNuxt` (called from `firebase-frameworks`) will look
		for the `nuxt.config.js` file in the destination directory.
		*/
  if (nuxtConfig.ssr === false) {
    const nuxtConfigFile = nuxtConfig._nuxtConfigFile.split("/").pop();
    await copy(nuxtConfig._nuxtConfigFile, join(destDir, nuxtConfigFile));
  }

  return { packageJson: { ...packageJson }, frameworksEntry: "nuxt" };
}
