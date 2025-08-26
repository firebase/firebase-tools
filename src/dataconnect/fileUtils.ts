import * as fs from "fs-extra";
import * as path from "path";

import { Platform, SupportedFrameworks } from "./types";
import { PackageJSON } from "../frameworks/compose/discover/runtime/node";

// case insensitive exact match indicators for supported app platforms
const WEB_INDICATORS = ["package.json", "package-lock.json", "node_modules"];
const IOS_INDICATORS = ["info.plist", "podfile", "package.swift", ".xcodeproj"];
// Note: build.gradle can be nested inside android/ and android/app.
const ANDROID_INDICATORS = ["androidmanifest.xml", "build.gradle", "build.gradle.kts"];
const DART_INDICATORS = ["pubspec.yaml", "pubspec.lock"];

// endswith match
const IOS_POSTFIX_INDICATORS = [".xcworkspace", ".xcodeproj"];

// given a directory, determine the platform type
export async function getPlatformFromFolder(dirPath: string) {
  // Check for file indicators
  const fileNames = await fs.readdir(dirPath);

  let hasWeb = false;
  let hasAndroid = false;
  let hasIOS = false;
  let hasDart = false;
  for (const fileName of fileNames) {
    const cleanedFileName = fileName.toLowerCase();
    hasWeb ||= WEB_INDICATORS.some((indicator) => indicator === cleanedFileName);
    hasAndroid ||= ANDROID_INDICATORS.some((indicator) => indicator === cleanedFileName);
    hasIOS ||=
      IOS_INDICATORS.some((indicator) => indicator === cleanedFileName) ||
      IOS_POSTFIX_INDICATORS.some((indicator) => cleanedFileName.endsWith(indicator));
    hasDart ||= DART_INDICATORS.some((indicator) => indicator === cleanedFileName);
  }
  if (!hasWeb && !hasAndroid && !hasIOS && !hasDart) {
    return Platform.NONE;
  } else if (hasWeb && !hasAndroid && !hasIOS && !hasDart) {
    return Platform.WEB;
  } else if (hasAndroid && !hasWeb && !hasIOS && !hasDart) {
    return Platform.ANDROID;
  } else if (hasIOS && !hasWeb && !hasAndroid && !hasDart) {
    return Platform.IOS;
  } else if (hasDart && !hasWeb && !hasIOS && !hasAndroid) {
    return Platform.FLUTTER;
  }
  // At this point, its not clear which platform the app directory is
  // because we found indicators for multiple platforms.
  return Platform.MULTIPLE;
}

export async function resolvePackageJson(
  packageJsonPath: string,
): Promise<PackageJSON | undefined> {
  let validPackageJsonPath = packageJsonPath;
  if (!packageJsonPath.endsWith("package.json")) {
    validPackageJsonPath = path.join(packageJsonPath, "package.json");
  }
  validPackageJsonPath = path.resolve(validPackageJsonPath);
  try {
    return JSON.parse((await fs.readFile(validPackageJsonPath)).toString());
  } catch {
    return undefined;
  }
}

export const SUPPORTED_FRAMEWORKS: (keyof SupportedFrameworks)[] = ["react", "angular"];
export const frameworksMap: { [key in keyof SupportedFrameworks]: string[] } = {
  react: ["react", "next"],
  angular: ["@angular/core"],
};
export function getFrameworksFromPackageJson(
  packageJson: PackageJSON,
): (keyof SupportedFrameworks)[] {
  const devDependencies = Object.keys(packageJson.devDependencies ?? {});
  const dependencies = Object.keys(packageJson.dependencies ?? {});
  const allDeps = Array.from(new Set([...devDependencies, ...dependencies]));
  return SUPPORTED_FRAMEWORKS.filter((framework) =>
    frameworksMap[framework]!.find((dep) => allDeps.includes(dep)),
  );
}
