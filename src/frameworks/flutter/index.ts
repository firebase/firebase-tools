import { execSync } from "child_process";
import { copy, pathExists } from "fs-extra";
import { mkdir } from "fs/promises";
import { join } from "path";
import { BuildResult, Discovery, FrameworkType, SupportLevel } from "..";

export const name = "Flutter";
export const type = FrameworkType.Framework;
export const support = SupportLevel.Experimental;

export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!(await pathExists(join(dir, "pubspec.yaml")))) return;
  if (!(await pathExists(join(dir, "web")))) return;
  try {
    const deps = JSON.parse(execSync("flutter pub deps --json").toString());
    const flutter = deps.sdks?.some((it: any) => it.name === "Flutter");
    if (!flutter) return;
    return { mayWantBackend: false, publicDirectory: join(dir, "web") };
  } catch (e) {
    // continue
  }
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
