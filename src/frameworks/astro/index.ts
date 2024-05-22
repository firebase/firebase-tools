import { sync as spawnSync, spawn } from "cross-spawn";
import { copy, existsSync } from "fs-extra";
import { readFile } from "fs/promises";
import { join } from "path";
import { load } from "js-yaml";
import { BuildResult, Discovery, FrameworkType, SupportLevel, BundleConfig } from "../interfaces";
import { FirebaseError } from "../../error";
import { readJSON, simpleProxy, warnIfCustomBuildScript, getNodeModuleBin } from "../utils";
import { getAstroVersion, getBootstrapScript, getConfig } from "./utils";

export const name = "Astro";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;
export const supportedRange = "2 - 4";

export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!existsSync(join(dir, "package.json"))) return;
  const version = getAstroVersion(dir);
  if (!version) return;
  const { output } = await getConfig(dir);
  return {
    mayWantBackend: output !== "static",
    version,
  };
}

const DEFAULT_BUILD_SCRIPT = ["astro build"];

let bundleConfig: BundleConfig;
async function getBundleConfigs(cwd: string): Promise<BundleConfig> {
  if (bundleConfig) {
    return bundleConfig;
  }

  const fileContents = await readFile(join(cwd, ".apphosting", "bundle.yaml"), "utf8");
  return load(fileContents);
}

export async function build(cwd: string): Promise<BuildResult> {
  await warnIfCustomBuildScript(cwd, name, DEFAULT_BUILD_SCRIPT);
  const build = spawnSync("npx", ["@apphosting/adapter-astro"], { cwd, stdio: "inherit" });
  if (build.status !== 0) throw new FirebaseError("Unable to build your Astro app");
  const bundleConfigs = await getBundleConfigs(cwd);
  return { wantsBackend: bundleConfigs.serverDirectory != null };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const bundleConfigs = await getBundleConfigs(root);
  for (const assetPath of bundleConfigs.staticAssets) {
    await copy(assetPath, dest);
  }
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const bundleConfigs = await getBundleConfigs(sourceDir);
  const packageJson = await readJSON(join(sourceDir, "package.json"));
  if (bundleConfigs.serverDirectory != null) {
    await copy(join(sourceDir, bundleConfigs.serverDirectory), join(destDir));
  }
  return {
    packageJson,
    bootstrapScript: getBootstrapScript(),
  };
}

export async function getDevModeHandle(cwd: string) {
  const host = new Promise<string>((resolve, reject) => {
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
    serve.on("exit", reject);
  });
  return simpleProxy(await host);
}
