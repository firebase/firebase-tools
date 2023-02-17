import { copy, existsSync, readFile } from "fs-extra";
import { join } from "path";
import type { Config } from "@sveltejs/kit";
import { FrameworkType, relativeRequire, SupportLevel } from "..";
import { viteDiscoverWithNpmDependency } from "../vite";
// TODO figure out why relativeRequire was not working
const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "SvelteKit";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;
export const discover = viteDiscoverWithNpmDependency("@sveltejs/kit");
export { getDevModeHandle } from "../vite";

export async function build(root: string) {
  const { build } = relativeRequire(root, "vite");
  await build({ root });
  // TODO can we be smarter about this?
  return { wantsBackend: true };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const config = await getConfig(root);
  const outDir = config.kit?.outDir || ".svelte-kit";

  const assetsPath = join(root, outDir, "output", "client");
  await copy(assetsPath, dest);

  const prerenderedPath = join(root, outDir, "output", "prerendered", "pages");
  if (existsSync(prerenderedPath)) {
    await copy(prerenderedPath, dest);
  }
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  const config = await getConfig(sourceDir);
  const outDir = config.kit?.outDir || ".svelte-kit";

  await copy(join(sourceDir, outDir, "output", "server"), join(destDir));

  return { packageJson: { ...packageJson }, frameworksEntry: "sveltekit" };
}

async function getConfig(root: string) {
  try {
    return (await dynamicImport(join(root, "svelte.config.js"))) as Config;
  } catch (e) {
    console.log("svelte.config.js not found");
    return {};
  }
}
