import { sync as spawnSync } from "cross-spawn";
import { copy, pathExists } from "fs-extra";
import { join } from "path";
import * as yaml from "js-yaml";
import { readFile } from "fs/promises";

import { BuildResult, Discovery, FrameworkType, SupportLevel } from "..";
import { FirebaseError } from "../../error";
import { assertFlutterCliExists } from "./utils";

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

export function build(cwd: string): Promise<BuildResult> {
  assertFlutterCliExists();
  const build = spawnSync("flutter", ["build", "web"], { cwd, stdio: "inherit" });
  if (build.status) throw new FirebaseError("Unable to build your Flutter app");
  return Promise.resolve({ wantsBackend: false });
}

export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  await copy(join(sourceDir, "build", "web"), destDir);
}
