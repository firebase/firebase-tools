import { sync as spawnSync, spawn } from "cross-spawn";
import { copy, existsSync } from "fs-extra";
import { join } from "path";
import { BuildResult, Discovery, FrameworkType, SupportLevel } from "../interfaces";
import { FirebaseError } from "../../error";
import { readJSON, simpleProxy, warnIfCustomBuildScript, getNodeModuleBin } from "../utils";
import { getAstroVersion, getBootstrapScript, getConfig } from "./utils";

export const name = "Astro";
export const support = SupportLevel.Experimental;
export const type = FrameworkType.MetaFramework;
export const supportedRange = "2 - 3";

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

export async function build(cwd: string): Promise<BuildResult> {
  const cli = getNodeModuleBin("astro", cwd);
  await warnIfCustomBuildScript(cwd, name, DEFAULT_BUILD_SCRIPT);
  const { output, adapter } = await getConfig(cwd);
  const wantsBackend = output !== "static";
  if (wantsBackend && adapter?.name !== "@astrojs/node") {
    throw new FirebaseError(
      "Deploying an Astro application with SSR on Firebase Hosting requires the @astrojs/node adapter in middleware mode. https://docs.astro.build/en/guides/integrations-guide/node/",
    );
  }
  const build = spawnSync(cli, ["build"], { cwd, stdio: "inherit" });
  if (build.status !== 0) throw new FirebaseError("Unable to build your Astro app");
  return { wantsBackend };
}

export async function ɵcodegenPublicDirectory(root: string, dest: string) {
  const { outDir, output } = await getConfig(root);
  // output: "server" in astro.config builds "client" and "server" folders, otherwise assets are in top-level outDir
  const assetPath = join(root, outDir, output !== "static" ? "client" : "");
  await copy(assetPath, dest);
}

export async function ɵcodegenFunctionsDirectory(sourceDir: string, destDir: string) {
  const { outDir } = await getConfig(sourceDir);
  const packageJson = await readJSON(join(sourceDir, "package.json"));
  await copy(join(sourceDir, outDir, "server"), join(destDir));
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
