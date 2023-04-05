import { copy, existsSync, pathExists, readFile } from "fs-extra";
import { join } from "path";
import { FrameworkType, relativeRequire, SupportLevel } from "..";
import { viteDiscoverWithNpmDependency } from "../vite";

const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "SvelteKit";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;
export const discover = viteDiscoverWithNpmDependency("@sveltejs/kit");
export { getDevModeHandle } from "../vite";

export async function build(root: string) {
  const { build } = relativeRequire(root, "vite");
  // SvelteKit uses process.cwd() unfortunately, chdir
  const cwd = process.cwd();
  process.chdir(root);
  await build({ root });
  process.chdir(cwd);
  return { wantsBackend: true };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const { kit: { outDir } } = await getConfig(root);
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
  packageJson.dependencies ||= {};
  packageJson.dependencies["@sveltejs/kit"] ??= packageJson.devDependencies["@sveltejs/kit"];

  const config = await getConfig(sourceDir);
  const outDir = config.kit.outDir;

  await copy(join(sourceDir, outDir, "output", "server"), join(destDir));

  return { packageJson, frameworksEntry: "sveltekit" };
}

interface SvelteKitConfig {
  kit: {
    outDir: string;
    files: {
      assets: string;
    };
  };
}

async function getConfig(root: string): Promise<SvelteKitConfig> {
  const configPath = join(root, "svelte.config.js");
  const configExists = await pathExists(configPath);
  const config = configExists ? (await dynamicImport(configPath)).default : {};
  config.kit ||= {};
  config.kit.outDir ||= ".svelte-kit";
  config.kit.files ||= {};
  config.kit.files.assets ||= "static";
  return config;
}
