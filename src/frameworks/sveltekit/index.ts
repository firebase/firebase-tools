import { copy, pathExists, readFile } from "fs-extra";
import { join } from "path";
import { FrameworkType, SupportLevel } from "..";
import { viteDiscoverWithNpmDependency, build as viteBuild } from "../vite";
import { SvelteKitConfig } from "./interfaces";
import { fileExistsSync } from "../../fsutils";

const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "SvelteKit";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;
export const discover = viteDiscoverWithNpmDependency("@sveltejs/kit");
export { getDevModeHandle } from "../vite";

export async function build(root: string) {
  const config = await getConfig(root);
  const wantsBackend = config.kit.adapter?.name !== "@sveltejs/adapter-static";
  await viteBuild(root);
  return { wantsBackend };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const config = await getConfig(root);
  const output = join(root, config.kit.outDir, "output");
  await copy(join(output, "client"), dest);

  const prerenderedPath = join(output, "prerendered", "pages");
  if (await pathExists(prerenderedPath)) {
    await copy(prerenderedPath, dest);
  }
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  packageJson.dependencies ||= {};
  packageJson.dependencies["@sveltejs/kit"] ??= packageJson.devDependencies["@sveltejs/kit"];

  const config = await getConfig(sourceDir);
  await copy(join(sourceDir, config.kit.outDir, "output", "server"), destDir);

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
