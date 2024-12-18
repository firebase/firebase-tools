import * as fs from "fs-extra";
import { join } from "path";
import { FrameworkType, SupportLevel } from "../interfaces.js";
import { viteDiscoverWithNpmDependency, build as viteBuild } from "../vite/index.js";
import { SvelteKitConfig } from "./interfaces.js";
import { fileExistsSync } from "../../fsutils.js";
import Module from "node:module";

const require = Module.createRequire(import.meta.url);
const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "SvelteKit";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;
export const discover = viteDiscoverWithNpmDependency("@sveltejs/kit");

export { getDevModeHandle, supportedRange } from "../vite/index.js";

export async function build(root: string, target: string) {
  const config = await getConfig(root);
  const wantsBackend = config.kit.adapter?.name !== "@sveltejs/adapter-static";
  await viteBuild(root, target);
  return { wantsBackend };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const config = await getConfig(root);
  const output = join(root, config.kit.outDir, "output");
  await fs.copy(join(output, "client"), dest);

  const prerenderedPath = join(output, "prerendered", "pages");
  if (await fs.pathExists(prerenderedPath)) {
    await fs.copy(prerenderedPath, dest);
  }
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await fs.readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  packageJson.dependencies ||= {};
  packageJson.dependencies["@sveltejs/kit"] ??= packageJson.devDependencies["@sveltejs/kit"];

  const config = await getConfig(sourceDir);
  await fs.copy(join(sourceDir, config.kit.outDir, "output", "server"), destDir);

  return { packageJson, frameworksEntry: "sveltekit" };
}

async function getConfig(root: string): Promise<SvelteKitConfig> {
  const configPath = ["svelte.config.js", "svelte.config.mjs"]
    .map((filename) => join(root, filename))
    .find(fileExistsSync);
  const config = configPath ? (await dynamicImport(configPath)).default : {};
  config.kit ||= {};
  config.kit.outDir ||= ".svelte-kit";
  return config;
}
