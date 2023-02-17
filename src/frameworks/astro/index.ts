import { execSync, spawn } from "child_process";
import { copy, readFile, existsSync } from "fs-extra";
import { join } from "path";
import { BuildResult, Discovery, FrameworkType, SupportLevel } from "..";
import type { AstroConfig } from "astro";
import { proxyRequestHandler } from "../../hosting/proxy";
const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "Astro";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;

const CLI_COMMAND = join(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "astro.cmd" : "astro"
);

let resolvedConfig: AstroConfig;
export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!existsSync(join(dir, "package.json"))) return;
  // TODO extract to getConfig()?
  const possibleConfigPaths = [
    "astro.config.js",
    "astro.config.ts",
    "astro.config.mjs",
    "astro.config.cjs",
    "astro.config.mts",
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

  return {
    packageJson: { ...packageJson },
    frameworksEntry: "astro",
    bootstrapScript: getBootstrapScript(),
  };
}

export async function getDevModeHandle(dir: string) {
  const host = new Promise<string>((resolve) => {
    // Can't use scheduleTarget since that—like prerender—is failing on an ESM bug
    // will just grep for the hostname
    const serve = spawn(CLI_COMMAND, ["dev"], { cwd: dir });
    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/.+:\d+)/);
      if (match) resolve(match[1]);
    });
    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });
  });
  return proxyRequestHandler(await host, "Astro Development Server", { forceCascade: true });
}

export function getBootstrapScript() {
  // `astro build` with node adapter in middleware mode will generate a middleware at entry.mjs
  // need to convert the export to `handle` to work with express integration
  const bootstrapScript = `const entry = import('./entry.mjs');\nexport const handle = async (req, res) => (await entry).handler(req, res)`;

  return bootstrapScript;
}
