import { sync as spawnSync } from "cross-spawn";
import { FirebaseError } from "../../error";
import { readFile } from "fs/promises";
import { join } from "path";
import * as yaml from "yaml";

export function assertFlutterCliExists() {
  const process = spawnSync("flutter", ["--version"], { stdio: "ignore" });
  if (process.status !== 0)
    throw new FirebaseError(
      "Flutter CLI not found, follow the instructions here https://docs.flutter.dev/get-started/install before trying again.",
    );
}

export function getTreeShakeFlag(pubSpec: Record<string, any>): string {
  const treeShakePackages = [
    "material_icons_named",
    "material_symbols_icons",
    "material_design_icons_flutter",
    "flutter_iconpicker",
    "font_awesome_flutter",
    "ionicons_named",
  ];

  const hasTreeShakePackage = treeShakePackages.some((pkg) => pubSpec.dependencies?.[pkg]);
  return hasTreeShakePackage ? "--no-tree-shake-icons" : "";
}

export async function getPubSpec(cwd: string): Promise<Record<string, any>> {
  try {
    const pubSpecBuffer = await readFile(join(cwd, "pubspec.yaml"));
    return yaml.parse(pubSpecBuffer.toString());
  } catch (error) {
    console.info("pubspec.yaml not found, skipping tree shaking");
    return {};
  }
}
