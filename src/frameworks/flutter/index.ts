import { execSync } from "child_process";
import { copy, pathExists } from "fs-extra";
import { mkdir } from "fs/promises";
import { join } from "path";
import { BuildResult, Discovery, FrameworkType, SupportLevel } from "..";
import * as yaml from "js-yaml";
import { readFile } from "fs/promises";

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

export function build(dir: string): Promise<BuildResult> {
  execSync(`flutter build web --release`, {
    cwd: dir,
    stdio: "inherit",
  });
  return Promise.resolve({ wantsBackend: false });
}

export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  await mkdir(destDir, { recursive: true });
  await copy(join(sourceDir, "build", "web"), destDir);
}
