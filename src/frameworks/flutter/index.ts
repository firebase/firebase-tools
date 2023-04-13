import { sync as execSync } from "cross-spawn";
import { copy, pathExists } from "fs-extra";
import { mkdir } from "fs/promises";
import { join } from "path";
import { BuildResult, Discovery, FrameworkType, SupportLevel } from "..";
import * as yaml from "js-yaml";
import { readFile } from "fs/promises";
import { FirebaseError } from "../../error";

export const name = "Flutter";
export const type = FrameworkType.Framework;
export const support = SupportLevel.Experimental;

export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!(await pathExists(join(dir, "pubspec.yaml")))) return;
  if (!(await pathExists(join(dir, "web")))) return;
  const pubSpecBuffer = await readFile(join(dir, "pubspec.yaml"));
  const pubSpec = yaml.load(pubSpecBuffer.toString());
  const usingFlutter = pubSpec.dependencies?.flutter;
  if (!usingFlutter) return;
  return { mayWantBackend: false, publicDirectory: join(dir, "web") };
}

function getFlutterVersion() {
  const process = execSync("flutter --version", { stdio: "ignore" });
  if (process.status) throw new FirebaseError("Flutter CLI not found.");
  const version = process.stdout?.toString().match(/Flutter (\S+)/)?.[1];
  if (!version) throw new FirebaseError("Unable to determine Flutter version.");
  return version;
}

export function build(cwd: string): Promise<BuildResult> {
  getFlutterVersion();
  const build = execSync("flutter build web", { cwd, stdio: "inherit" });
  if (build.status) throw new FirebaseError("Unable to build your Flutter app");
  return Promise.resolve({ wantsBackend: false });
}

export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  await mkdir(destDir, { recursive: true });
  await copy(join(sourceDir, "build", "web"), destDir);
}
