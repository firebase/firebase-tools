import { copy, readFile, existsSync, pathExists } from "fs-extra";
import { join } from "path";
import { FrameworkType, relativeRequire, SupportLevel } from "..";
// TODO figure out why relativeRequire was not working
const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "Astro";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;

export const discover = async (dir: string) => {
  if (!existsSync(join(dir, "package.json"))) return;
  const possibleConfigPaths = [
    "astro.config.mjs",
    "astro.config.js",
    "astro.config.ts",
    "astro.config.mts",
    "astro.config.cjs",
    "astro.config.cts",
  ].map((file) => join(dir, file));

  let resolvedConfigPath;
  for (const path of possibleConfigPaths) {
    if (existsSync(path)) {
      resolvedConfigPath = path;
    }
  }
  if (!resolvedConfigPath) return;

  const config = await import(join(dir, resolvedConfigPath));

  return {
    mayWantBackend: config.output === "server",
    publicDirectory: config.publicDir ?? "public",
  };
};
// export const init = initViteTemplate("svelte");

export async function build(root: string) {
  // const { build } = relativeRequire(root, "vite");
  // await build({ root });
  // return { wantsBackend: true };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const config = await dynamicImport(join(root, "astro.config.mjs"));
  const outDir = config.outDir || "dist";
  const prerenderedPath = join(root, outDir, "client");

  console.log("copying files...");
  await copy(prerenderedPath, dest);
}

// export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
//   const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
//   const packageJson = JSON.parse(packageJsonBuffer.toString());

//   await copy(join(sourceDir, ".svelte-kit", "output", "server"), join(destDir));

//   return { packageJson: { ...packageJson }, frameworksEntry: "sveltekit" };
// }
