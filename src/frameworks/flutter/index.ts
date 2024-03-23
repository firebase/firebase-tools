import { sync as spawnSync } from "cross-spawn";
import { copy, pathExists } from "fs-extra";
import { join } from "path";
import { load as loadYaml } from "js-yaml";
import { readFile } from "fs/promises";

import { BuildResult, Discovery, FrameworkType, SupportLevel } from "../interfaces";
import { FirebaseError } from "../../error";
import { assertFlutterCliExists } from "./utils";
import { DART_RESERVED_WORDS, FALLBACK_PROJECT_NAME } from "./constants";

export const name = "Flutter Web";
export const type = FrameworkType.Framework;
export const support = SupportLevel.Experimental;

export async function discover(dir: string): Promise<Discovery | undefined> {
  if (!(await pathExists(join(dir, "pubspec.yaml")))) return;
  if (!(await pathExists(join(dir, "web")))) return;
  const pubSpecBuffer = await readFile(join(dir, "pubspec.yaml"));
  const pubSpec = loadYaml(pubSpecBuffer.toString());
  const usingFlutter = pubSpec.dependencies?.flutter;
  if (!usingFlutter) return;
  return { mayWantBackend: false };
}

export function init(setup: any, config: any) {
  assertFlutterCliExists();
  // Convert the projectId into a valid pubspec name https://dart.dev/tools/pub/pubspec#name
  // the projectId should be safe, save hyphens which we turn into underscores here
  // if it's a reserved word just give it a fallback name
  const projectName = DART_RESERVED_WORDS.includes(setup.projectId)
    ? FALLBACK_PROJECT_NAME
    : setup.projectId.replaceAll("-", "_");
  const result = spawnSync(
    "flutter",
    [
      "create",
      "--template=app",
      `--project-name=${projectName}`,
      "--overwrite",
      "--platforms=web",
      setup.hosting.source,
    ],
    { stdio: "inherit", cwd: config.projectDir },
  );
  if (result.status !== 0)
    throw new FirebaseError(
      "We were not able to create your flutter app, create the application yourself https://docs.flutter.dev/get-started/test-drive?tab=terminal before trying again.",
    );
  return Promise.resolve();
}

export function build(cwd: string): Promise<BuildResult> {
  assertFlutterCliExists();
  const build = spawnSync("flutter", ["build", "web"], { cwd, stdio: "inherit" });
  if (build.status !== 0) throw new FirebaseError("Unable to build your Flutter app");
  return Promise.resolve({ wantsBackend: false });
}

export async function ɵcodegenPublicDirectory(sourceDir: string, destDir: string) {
  await copy(join(sourceDir, "build", "web"), destDir);
}
