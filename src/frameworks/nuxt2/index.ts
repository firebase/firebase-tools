import { copy, pathExists } from "fs-extra";
import { readFile } from "fs/promises";
import { basename, join, relative } from "path";
import { gte } from "semver";

import { SupportLevel, FrameworkType } from "../interfaces";
import { getNodeModuleBin, relativeRequire } from "../utils";
import { getNuxtVersion } from "../nuxt/utils";
import { simpleProxy } from "../utils";
import { spawn } from "cross-spawn";

export const name = "Nuxt";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;
export const supportedRange = "2";

async function getAndLoadNuxt(options: { rootDir: string; for: string }) {
  const nuxt = await relativeRequire(options.rootDir, "nuxt/dist/nuxt.js");
  const app = await nuxt.loadNuxt(options);
  await app.ready();
  return { app, nuxt };
}

/**
 *
 * @param rootDir current directory
 * @return undefined if project is not Nuxt 2, {mayWantBackend: true } otherwise
 */
export async function discover(rootDir: string) {
  if (!(await pathExists(join(rootDir, "package.json")))) return;
  const version = getNuxtVersion(rootDir);
  if (!version || (version && gte(version, "3.0.0-0"))) return;
  return { mayWantBackend: true, version };
}

/**
 *
 * @param rootDir nuxt project root
 * @return whether backend is needed or not
 */
export async function build(rootDir: string) {
  const { app, nuxt } = await getAndLoadNuxt({ rootDir, for: "build" });
  const {
    options: { ssr, target },
  } = app;

  // Nuxt seems to use process.cwd() somewhere
  const cwd = process.cwd();
  process.chdir(rootDir);

  await nuxt.build(app);
  const { app: generateApp } = await getAndLoadNuxt({ rootDir, for: "start" });
  const builder = await nuxt.getBuilder(generateApp);
  const generator = new nuxt.Generator(generateApp, builder);
  await generator.generate({ build: false, init: true });

  process.chdir(cwd);

  const wantsBackend = ssr && target === "server";
  const rewrites = wantsBackend ? [] : [{ source: "**", destination: "/200.html" }];

  return { wantsBackend, rewrites };
}

/**
 * Copy the static files to the destination directory whether it's a static build or server build.
 * @param rootDir
 * @param dest
 */
export async function ɵcodegenPublicDirectory(rootDir: string, dest: string) {
  const {
    app: { options },
  } = await getAndLoadNuxt({ rootDir, for: "build" });
  await copy(options.generate.dir, dest);
}

export async function ɵcodegenFunctionsDirectory(rootDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(rootDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  // Get the nuxt config into an object so we can check the `target` and `ssr` properties.
  const {
    app: { options },
  } = await getAndLoadNuxt({ rootDir, for: "build" });
  const { buildDir, _nuxtConfigFile: configFilePath } = options;

  // When starting the Nuxt 2 server, we need to copy the `.nuxt` to the destination directory (`functions`)
  // with the same folder name (.firebase/<project-name>/functions/.nuxt).
  // This is because `loadNuxt` (called from `firebase-frameworks`) will only look
  // for the `.nuxt` directory in the destination directory.
  await copy(buildDir, join(destDir, relative(rootDir, buildDir)));

  // TODO pack this
  await copy(configFilePath, join(destDir, basename(configFilePath)));

  return { packageJson: { ...packageJson }, frameworksEntry: "nuxt" };
}

export async function getDevModeHandle(cwd: string) {
  const host = new Promise<string>((resolve, reject) => {
    const cli = getNodeModuleBin("nuxt", cwd);
    const serve = spawn(cli, ["dev"], { cwd });

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
