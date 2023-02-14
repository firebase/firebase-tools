import { execSync } from "child_process";
import { copy, readFile, existsSync } from "fs-extra";
import { join } from "path";
import { BuildResult, Discovery, FrameworkType, SupportLevel } from "..";
import type { AstroConfig } from "astro";
// TODO figure out why relativeRequire was not working
const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "Astro";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;

let resolvedConfig: AstroConfig;
export async function discover(dir: string): Promise<Discovery | undefined> {
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

  resolvedConfig = (await dynamicImport(resolvedConfigPath)).default;

  if (resolvedConfig.output === "server" && resolvedConfig.adapter?.name !== "@astrojs/node") {
    throw new Error(
      '@astrojs/node adapter with `mode: "middleware"` is required when specifying `output: "server"`\nhttps://docs.astro.build/en/guides/integrations-guide/node/#middleware'
    );
  }

  return {
    mayWantBackend: resolvedConfig.output === "server",
    publicDirectory: resolvedConfig.publicDir?.toString() ?? "public",
  };
}

// export const init = initViteTemplate("svelte");

export async function build(root: string): Promise<BuildResult> {
  execSync("npm run build", { cwd: root, stdio: "inherit" });

  return { wantsBackend: resolvedConfig.output === "server" };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const outDir = resolvedConfig.outDir?.toString() ?? "dist";
  // output: "server" in astro.config builds "client" and "server" folders, otherwise assets are in top-level outDir
  const assetPath = join(root, outDir, resolvedConfig.output === "server" ? "client" : "");

  await copy(assetPath, dest);
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  await copy(join(sourceDir, resolvedConfig.outDir?.toString() ?? "dist", "server"), join(destDir));

  return { packageJson: { ...packageJson }, frameworksEntry: "astro" };
}
