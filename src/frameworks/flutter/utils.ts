import { sync as spawnSync } from "cross-spawn";
import { FirebaseError } from "../../error";
import { readFile } from "fs/promises";
import * as yaml from "yaml";

export function assertFlutterCliExists() {
  const process = spawnSync("flutter", ["--version"], { stdio: "ignore" });
  if (process.status !== 0)
    throw new FirebaseError(
      "Flutter CLI not found, follow the instructions here https://docs.flutter.dev/get-started/install before trying again.",
    );
}

export async function getTreeShakeFlag(): Promise<string> {
  const pubSpecPath = "./pubspec.yaml";
  let pubSpec: Record<string, any> = {};
  try {
    const pubSpecBuffer = await readFile(pubSpecPath);
    pubSpec = yaml.parse(pubSpecBuffer.toString());
  } catch (error) {
    console.info("pubspec.yaml not found, skipping tree shaking");
    return "";
  }

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
