import * as fs from "fs-extra";
import * as path from "path";
import { glob } from "glob";
import { Framework, Platform } from "./types";
import { PackageJSON } from "../frameworks/compose/discover/runtime/node";

export interface App {
  platform: Platform;
  directory: string;
  frameworks?: Framework[];
}

/** Returns a string description of the app */
export function appDescription(a: App): string {
  return `${a.directory} (${a.platform.toLowerCase()})`;
}

/** Given a directory, determine the platform type */
export async function getPlatformFromFolder(dirPath: string): Promise<Platform> {
  const apps = await detectApps(dirPath);
  const hasWeb = apps.some((app) => app.platform === Platform.WEB);
  const hasAndroid = apps.some((app) => app.platform === Platform.ANDROID);
  const hasIOS = apps.some((app) => app.platform === Platform.IOS);
  const hasDart = apps.some((app) => app.platform === Platform.FLUTTER);
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

/** Detects the apps in a given directory */
export async function detectApps(dirPath: string): Promise<App[]> {
  const packageJsonFiles = await detectFiles(dirPath, "package.json");
  const pubSpecYamlFiles = await detectFiles(dirPath, "pubspec.yaml");
  const srcMainFolders = await detectFiles(dirPath, "src/main/");
  const xCodeProjects = await detectFiles(dirPath, "*.xcodeproj/");
  const webApps = await Promise.all(packageJsonFiles.map((p) => packageJsonToWebApp(dirPath, p)));
  const flutterApps = pubSpecYamlFiles.map((f) => ({
    platform: Platform.FLUTTER,
    directory: path.dirname(f),
  }));
  const androidApps = srcMainFolders
    .map((f) => ({
      platform: Platform.ANDROID,
      directory: path.dirname(path.dirname(f)),
    }))
    .filter((a) => !flutterApps.some((f) => isPathInside(f.directory, a.directory)));
  const iosApps = xCodeProjects
    .map((f) => ({
      platform: Platform.IOS,
      directory: path.dirname(f),
    }))
    .filter((a) => !flutterApps.some((f) => isPathInside(f.directory, a.directory)));
  return [...webApps, ...flutterApps, ...androidApps, ...iosApps];
}

export function isPathInside(parent: string, child: string): boolean {
  const relativePath = path.relative(parent, child);
  return !relativePath.startsWith(`..`);
}

async function packageJsonToWebApp(dirPath: string, packageJsonFile: string): Promise<App> {
  const fullPath = path.join(dirPath, packageJsonFile);
  const packageJson = JSON.parse((await fs.readFile(fullPath)).toString());
  return {
    platform: Platform.WEB,
    directory: path.dirname(packageJsonFile),
    frameworks: getFrameworksFromPackageJson(packageJson),
  };
}

export const WEB_FRAMEWORKS: Framework[] = ["react", "angular"];
export const WEB_FRAMEWORKS_SIGNALS: { [key in Framework]: string[] } = {
  react: ["react", "next"],
  angular: ["@angular/core"],
};

export function getFrameworksFromPackageJson(packageJson: PackageJSON): Framework[] {
  const devDependencies = Object.keys(packageJson.devDependencies ?? {});
  const dependencies = Object.keys(packageJson.dependencies ?? {});
  const allDeps = Array.from(new Set([...devDependencies, ...dependencies]));
  return WEB_FRAMEWORKS.filter((framework) =>
    WEB_FRAMEWORKS_SIGNALS[framework]!.find((dep) => allDeps.includes(dep)),
  );
}

async function detectFiles(dirPath: string, filePattern: string): Promise<string[]> {
  const options = {
    cwd: dirPath,
    ignore: [
      "**/dataconnect*/**",
      "**/node_modules/**", // Standard dependency directory
      "**/dist/**", // Common build output
      "**/build/**", // Common build output
      "**/out/**", // Another common build output
      "**/.next/**", // Next.js build directory
      "**/coverage/**", // Test coverage reports
    ],
    absolute: false,
  };
  return glob(`**/${filePattern}`, options);
}
