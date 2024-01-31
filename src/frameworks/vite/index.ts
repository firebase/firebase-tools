import { execSync } from "child_process";
import { spawn } from "cross-spawn";
import { existsSync } from "fs";
import { copy, pathExists } from "fs-extra";
import { join } from "path";
const stripAnsi = require("strip-ansi");
import { FrameworkType, SupportLevel } from "../interfaces";
import { promptOnce } from "../../prompt";
import {
  simpleProxy,
  warnIfCustomBuildScript,
  findDependency,
  getNodeModuleBin,
  relativeRequire,
} from "../utils";

export const name = "Vite";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;
export const supportedRange = "3 - 5";

export const DEFAULT_BUILD_SCRIPT = ["vite build", "tsc && vite build"];

export const initViteTemplate = (template: string) => async (setup: any, config: any) =>
  await init(setup, config, template);

export async function init(setup: any, config: any, baseTemplate: string = "vanilla") {
  const template = await promptOnce({
    type: "list",
    default: "JavaScript",
    message: "What language would you like to use?",
    choices: [
      { name: "JavaScript", value: baseTemplate },
      { name: "TypeScript", value: `${baseTemplate}-ts` },
    ],
  });
  execSync(
    `npm create vite@"${supportedRange}" ${setup.hosting.source} --yes -- --template ${template}`,
    {
      stdio: "inherit",
      cwd: config.projectDir,
    },
  );
  execSync(`npm install`, { stdio: "inherit", cwd: join(config.projectDir, setup.hosting.source) });
}

export const viteDiscoverWithNpmDependency = (dep: string) => async (dir: string) =>
  await discover(dir, undefined, dep);

export const vitePluginDiscover = (plugin: string) => async (dir: string) =>
  await discover(dir, plugin);

export async function discover(dir: string, plugin?: string, npmDependency?: string) {
  if (!existsSync(join(dir, "package.json"))) return;
  // If we're not searching for a vite plugin, depth has to be zero
  const additionalDep =
    npmDependency && findDependency(npmDependency, { cwd: dir, depth: 0, omitDev: false });
  const depth = plugin ? undefined : 0;
  const configFilesExist = await Promise.all([
    pathExists(join(dir, "vite.config.js")),
    pathExists(join(dir, "vite.config.ts")),
  ]);
  const anyConfigFileExists = configFilesExist.some((it) => it);
  const version: string | undefined = findDependency("vite", {
    cwd: dir,
    depth,
    omitDev: false,
  })?.version;
  if (!anyConfigFileExists && !version) return;
  if (npmDependency && !additionalDep) return;
  const { appType, publicDir: publicDirectory, plugins } = await getConfig(dir);
  if (plugin && !plugins.find(({ name }) => name === plugin)) return;
  return {
    mayWantBackend: appType !== "spa",
    publicDirectory,
    version,
    vite: true,
  };
}

export async function build(root: string, target: string) {
  const { build } = await relativeRequire(root, "vite");

  await warnIfCustomBuildScript(root, name, DEFAULT_BUILD_SCRIPT);

  // SvelteKit uses process.cwd() unfortunately, chdir
  const cwd = process.cwd();
  process.chdir(root);

  const originalNodeEnv = process.env.NODE_ENV;

  // Downcasting as `string` as otherwise it is inferred as `readonly 'NODE_ENV'`,
  // but `env[key]` expects a non-readonly variable.
  const envKey: string = "NODE_ENV";
  // Voluntarily making .env[key] not statically analyzable to avoid
  // Webpack from converting it to "development" = target;
  process.env[envKey] = target;

  await build({ root, mode: target });
  process.chdir(cwd);

  // Voluntarily making .env[key] not statically analyzable to avoid
  // Webpack from converting it to "development" = target;
  process.env[envKey] = originalNodeEnv;

  return { rewrites: [{ source: "**", destination: "/index.html" }] };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const viteConfig = await getConfig(root);
  const viteDistPath = join(root, viteConfig.build.outDir);
  await copy(viteDistPath, dest);
}

export async function getDevModeHandle(dir: string) {
  const host = new Promise<string>((resolve, reject) => {
    // Can't use scheduleTarget since that—like prerender—is failing on an ESM bug
    // will just grep for the hostname
    const cli = getNodeModuleBin("vite", dir);
    const serve = spawn(cli, [], { cwd: dir });
    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const dataWithoutAnsiCodes = stripAnsi(data.toString());
      const match = dataWithoutAnsiCodes.match(/(http:\/\/.+:\d+)/);
      if (match) resolve(match[1]);
    });
    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });

    serve.on("exit", reject);
  });
  return simpleProxy(await host);
}

async function getConfig(root: string) {
  const { resolveConfig } = await relativeRequire(root, "vite");
  // SvelteKit uses process.cwd() unfortunately, we should be defensive here
  const cwd = process.cwd();
  process.chdir(root);
  const config = await resolveConfig({ root }, "build", "production");
  process.chdir(cwd);
  return config;
}
