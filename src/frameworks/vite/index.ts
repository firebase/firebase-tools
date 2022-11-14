import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { copy, pathExists } from "fs-extra";
import { join } from "path";
import { findDependency, FrameworkType, relativeRequire, SupportLevel } from "..";
import { proxyRequestHandler } from "../../hosting/proxy";
import { promptOnce } from "../../prompt";
import { isUsingCustomBuildScript } from "../utils";

export const name = "Vite";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.Toolchain;

const CLI_COMMAND = join(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vite.cmd" : "vite"
);

const VITE_BUILD_COMMAND = "vite build";

export const initViteTemplate = (template: string) => async (setup: any) =>
  await init(setup, template);

export async function init(setup: any, baseTemplate: string = "vanilla") {
  const template = await promptOnce({
    type: "list",
    default: "JavaScript",
    message: "What language would you like to use?",
    choices: [
      { name: "JavaScript", value: baseTemplate },
      { name: "TypeScript", value: `${baseTemplate}-ts` },
    ],
  });
  execSync(`npm create vite@latest ${setup.hosting.source} --yes -- --template ${template}`, {
    stdio: "inherit",
  });
  execSync(`npm install`, { stdio: "inherit", cwd: setup.hosting.source });
}

export const viteDiscoverWithNpmDependency = (dep: string) => async (dir: string) =>
  await discover(dir, undefined, dep);

export const vitePluginDiscover = (plugin: string) => async (dir: string) =>
  await discover(dir, plugin);

export async function discover(dir: string, plugin?: string, npmDependency?: string) {
  if (!existsSync(join(dir, "package.json"))) return;
  // If we're not searching for a vite plugin, depth has to be zero
  const additionalDep =
    npmDependency && findDependency(npmDependency, { cwd: dir, depth: 0, omitDev: true });
  const depth = plugin ? undefined : 0;
  const configFilesExist = await Promise.all([
    pathExists(join(dir, "vite.config.js")),
    pathExists(join(dir, "vite.config.ts")),
  ]);
  const anyConfigFileExists = configFilesExist.some((it) => it);
  if (!anyConfigFileExists && !findDependency("vite", { cwd: dir, depth, omitDev: false })) return;
  if (npmDependency && !additionalDep) return;
  const { appType, publicDir: publicDirectory, plugins } = await getConfig(dir);
  if (plugin && !plugins.find(({ name }) => name === plugin)) return;
  return { mayWantBackend: appType !== "spa", publicDirectory };
}

export async function build(root: string) {
  const { build } = relativeRequire(root, "vite");

  if (await isUsingCustomBuildScript(root, VITE_BUILD_COMMAND)) {
    console.log(
      `\nWarning: You have a custom build script in your package.json. In order to use a custom build script, you have to use a custom integration. See the docs for details: https://firebase.google.com/docs/hosting/express\n`
    );
  }

  await build({ root });
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const viteConfig = await getConfig(root);
  const viteDistPath = join(root, viteConfig.build.outDir);
  await copy(viteDistPath, dest);
}

export async function getDevModeHandle(dir: string) {
  const host = new Promise<string>((resolve) => {
    // Can't use scheduleTarget since that—like prerender—is failing on an ESM bug
    // will just grep for the hostname
    const serve = spawn(CLI_COMMAND, [], { cwd: dir });
    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/.+:\d+)/);
      if (match) resolve(match[1]);
    });
    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });
  });
  return proxyRequestHandler(await host, "Vite Development Server", { forceCascade: true });
}

async function getConfig(root: string) {
  const { resolveConfig } = relativeRequire(root, "vite");
  return await resolveConfig({ root }, "build", "production");
}
