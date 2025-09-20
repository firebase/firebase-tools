import { Config } from "../../config";

export type WorkspacePlatform = "web" | "android" | "ios" | "flutter" | "react-native" | "unity";

export function detectWorkspacePlatform(config: Config): WorkspacePlatform | null {
  if (config.projectFileExists("pubspec.yaml")) return "flutter";
  if (config.projectFileExists("ProjectSettings/ProjectSettings.asset")) return "unity";
  if (config.projectFileExists("build.gradle") || config.projectFileExists("build.gradle.kts"))
    return "android";
  if (config.projectFileExists("Podfile") || config.projectFileExists("Package.swift"))
    return "ios";
  if (config.projectFileExists("package.json")) {
    const packageJson = config.readProjectFile("package.json", { json: true, fallback: null });
    // couldn't parse package.json but still assume web
    if (!packageJson) return "web";
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    if (dependencies["react-native"]) {
      return "react-native";
    }
    return "web";
  }

  return null;
}
