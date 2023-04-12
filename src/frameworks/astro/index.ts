import { sync as spawnSync, spawn } from "cross-spawn";
import { copy, readFile, existsSync } from "fs-extra";
import { join } from "path";
import {
  BuildResult,
  Discovery,
  FrameworkType,
  SupportLevel,
  findDependency,
  getNodeModuleBin,
} from "..";
import { AstroConfig } from "./interfaces";
import { logError } from "../../logError";
import { FirebaseError } from "../../error";
import { simpleProxy, warnIfCustomBuildScript } from "../utils";

const { dynamicImport } = require(true && "../../dynamicImport");

export const name = "Astro";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;

function getAstroVersion(cwd: string): string | undefined {
  return findDependency("astro", { cwd, depth: 0, omitDev: false })?.version;
}

export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!existsSync(join(dir, "package.json"))) return;
  if (!getAstroVersion(dir)) return;
  const config = await getConfig(dir);
  if (!config) return;
  return {
    mayWantBackend: config.output === "server",
    publicDirectory: config.publicDir,
  };
}

const DEFAULT_BUILD_SCRIPT = ["astro build"];

export async function build(cwd: string): Promise<BuildResult> {
  const cli = getNodeModuleBin("astro", cwd);
  await warnIfCustomBuildScript(cwd, name, DEFAULT_BUILD_SCRIPT);
  const build = spawnSync(cli, ["build"], { cwd, stdio: "inherit" });
  if (build.status) throw new FirebaseError("Unable to build your Astro app");
  const { output, adapter } = (await getConfig(cwd))!;
  if (output === "server" && adapter?.name !== "@astrojs/node") {
    logError("Something somethin @astrojs/node");
  }
  return { wantsBackend: output === "server" && adapter?.name === "@astrojs/node" };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const { outDir, output } = (await getConfig(root))!;
  // output: "server" in astro.config builds "client" and "server" folders, otherwise assets are in top-level outDir
  const assetPath = join(root, outDir, output === "server" ? "client" : "");
  await copy(assetPath, dest);
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const { outDir } = (await getConfig(sourceDir))!;
  const packageJsonBuffer = await readFile(join(sourceDir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());

  await copy(join(sourceDir, outDir, "server"), join(destDir));

  return {
    packageJson: { ...packageJson },
    frameworksEntry: "astro",
    bootstrapScript: getBootstrapScript(),
  };
}

export async function getDevModeHandle(cwd: string) {
  const host = new Promise<string>((resolve) => {
    const cli = getNodeModuleBin("astro", cwd);
    const serve = spawn(cli, ["dev"], { cwd });
    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/.+:\d+)/);
      if (match) resolve(match[1]);
    });
    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });
  });
  return simpleProxy(await host);
}

export function getBootstrapScript() {
  // `astro build` with node adapter in middleware mode will generate a middleware at entry.mjs
  // need to convert the export to `handle` to work with express integration
  return `const entry = import('./entry.mjs');\nexport const handle = async (req, res) => (await entry).handler(req, res)`;
}

async function getConfig(root: string): Promise<void | AstroConfig> {
  const configPath = [
    "astro.config.js",
    "astro.config.ts",
    "astro.config.mjs",
    "astro.config.cjs",
    "astro.config.mts",
    "astro.config.cts",
  ]
    .map((file) => join(root, file))
    .find(existsSync);
  if (!configPath) return;
  try {
    const { default: config } = await dynamicImport(configPath);
    config.output ||= "static";
    config.outDir ||= "dist";
    config.publicDir ||= "public";
    return config;
  } catch (e) {
    logError(e);
    return;
  }
}
