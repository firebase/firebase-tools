import { sync as spawnSync } from "cross-spawn";
import { FirebaseError } from "../../error";
import { readFile } from "fs/promises";
import { pathExists } from "fs-extra";
import { join } from "path";
import * as yaml from "yaml";

export function assertFlutterCliExists() {
  const process = spawnSync("flutter", ["--version"], { stdio: "ignore" });
  if (process.status !== 0)
    throw new FirebaseError(
      "Flutter CLI not found, follow the instructions here https://docs.flutter.dev/get-started/install before trying again.",
    );
}

/**
 * Determines additional build arguments for Flutter based on the project's dependencies.
 * @param {Record<string, any>} pubSpec - The parsed pubspec.yaml file contents.
 * @return {string[]} An array of additional build arguments.
 * @description
 * This function checks if the project uses certain packages that might require additional
 * flags to be added to the build step. If any of these packages are present in the
 * project's dependencies, the function returns an array with these flags.
 * Otherwise, it returns an empty array.
 * This change is inspired from the following issue:
 * https://github.com/firebase/firebase-tools/issues/6197
 */
export function getAdditionalBuildArgs(pubSpec: Record<string, any>): string[] {
  /*
  These packages are known to require the --no-tree-shake-icons flag
  when building for web.
  More dependencies might need to add here in the future.
  Related issue: https://github.com/firebase/firebase-tools/issues/6197
  */
  const treeShakePackages = [
    "material_icons_named",
    "material_symbols_icons",
    "material_design_icons_flutter",
    "flutter_iconpicker",
    "font_awesome_flutter",
    "ionicons_named",
  ];

  const hasTreeShakePackage = treeShakePackages.some((pkg) => pubSpec.dependencies?.[pkg]);
  const treeShakeFlags = hasTreeShakePackage ? ["--no-tree-shake-icons"] : [];
  return [...treeShakeFlags];
}

/**
 * Reads and parses the pubspec.yaml file from a given directory.
 * @param {string} dir - The directory path where pubspec.yaml is located.
 * @return {Promise<Record<string, any>>} A promise that resolves to the parsed contents of pubspec.yaml.
 * @description
 * This function checks for the existence of both pubspec.yaml and the 'web' directory
 * in the given path. If either is missing, it returns an empty object.
 * If both exist, it reads the pubspec.yaml file, parses its contents, and returns
 * the parsed object. In case of any errors during this process, it logs a message
 * and returns an empty object.
 */
export async function getPubSpec(dir: string): Promise<Record<string, any>> {
  if (!(await pathExists(join(dir, "pubspec.yaml")))) return {};
  if (!(await pathExists(join(dir, "web")))) return {};

  try {
    const pubSpecBuffer = await readFile(join(dir, "pubspec.yaml"));
    return yaml.parse(pubSpecBuffer.toString());
  } catch (error) {
    console.info("Failed to read pubspec.yaml");
    return {};
  }
}
