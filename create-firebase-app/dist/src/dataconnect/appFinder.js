"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFrameworksFromPackageJson = exports.WEB_FRAMEWORKS_SIGNALS = exports.WEB_FRAMEWORKS = exports.isPathInside = exports.detectApps = exports.getPlatformFromFolder = exports.appDescription = void 0;
const fs = require("fs-extra");
const path = require("path");
const glob_1 = require("glob");
const types_1 = require("./types");
/** Returns a string description of the app */
function appDescription(a) {
    return `${a.directory} (${a.platform.toLowerCase()})`;
}
exports.appDescription = appDescription;
/** Given a directory, determine the platform type */
async function getPlatformFromFolder(dirPath) {
    const apps = await detectApps(dirPath);
    const hasWeb = apps.some((app) => app.platform === types_1.Platform.WEB);
    const hasAndroid = apps.some((app) => app.platform === types_1.Platform.ANDROID);
    const hasIOS = apps.some((app) => app.platform === types_1.Platform.IOS);
    const hasDart = apps.some((app) => app.platform === types_1.Platform.FLUTTER);
    if (!hasWeb && !hasAndroid && !hasIOS && !hasDart) {
        return types_1.Platform.NONE;
    }
    else if (hasWeb && !hasAndroid && !hasIOS && !hasDart) {
        return types_1.Platform.WEB;
    }
    else if (hasAndroid && !hasWeb && !hasIOS && !hasDart) {
        return types_1.Platform.ANDROID;
    }
    else if (hasIOS && !hasWeb && !hasAndroid && !hasDart) {
        return types_1.Platform.IOS;
    }
    else if (hasDart && !hasWeb && !hasIOS && !hasAndroid) {
        return types_1.Platform.FLUTTER;
    }
    // At this point, its not clear which platform the app directory is
    // because we found indicators for multiple platforms.
    return types_1.Platform.MULTIPLE;
}
exports.getPlatformFromFolder = getPlatformFromFolder;
/** Detects the apps in a given directory */
async function detectApps(dirPath) {
    const packageJsonFiles = await detectFiles(dirPath, "package.json");
    const pubSpecYamlFiles = await detectFiles(dirPath, "pubspec.yaml");
    const srcMainFolders = await detectFiles(dirPath, "src/main/");
    const xCodeProjects = await detectFiles(dirPath, "*.xcodeproj/");
    const webApps = await Promise.all(packageJsonFiles.map((p) => packageJsonToWebApp(dirPath, p)));
    const flutterApps = pubSpecYamlFiles.map((f) => ({
        platform: types_1.Platform.FLUTTER,
        directory: path.dirname(f),
    }));
    const androidApps = srcMainFolders
        .map((f) => ({
        platform: types_1.Platform.ANDROID,
        directory: path.dirname(path.dirname(f)),
    }))
        .filter((a) => !flutterApps.some((f) => isPathInside(f.directory, a.directory)));
    const iosApps = xCodeProjects
        .map((f) => ({
        platform: types_1.Platform.IOS,
        directory: path.dirname(f),
    }))
        .filter((a) => !flutterApps.some((f) => isPathInside(f.directory, a.directory)));
    return [...webApps, ...flutterApps, ...androidApps, ...iosApps];
}
exports.detectApps = detectApps;
function isPathInside(parent, child) {
    const relativePath = path.relative(parent, child);
    return !relativePath.startsWith(`..`);
}
exports.isPathInside = isPathInside;
async function packageJsonToWebApp(dirPath, packageJsonFile) {
    const fullPath = path.join(dirPath, packageJsonFile);
    const packageJson = JSON.parse((await fs.readFile(fullPath)).toString());
    return {
        platform: types_1.Platform.WEB,
        directory: path.dirname(packageJsonFile),
        frameworks: getFrameworksFromPackageJson(packageJson),
    };
}
exports.WEB_FRAMEWORKS = ["react", "angular"];
exports.WEB_FRAMEWORKS_SIGNALS = {
    react: ["react", "next"],
    angular: ["@angular/core"],
};
function getFrameworksFromPackageJson(packageJson) {
    var _a, _b;
    const devDependencies = Object.keys((_a = packageJson.devDependencies) !== null && _a !== void 0 ? _a : {});
    const dependencies = Object.keys((_b = packageJson.dependencies) !== null && _b !== void 0 ? _b : {});
    const allDeps = Array.from(new Set([...devDependencies, ...dependencies]));
    return exports.WEB_FRAMEWORKS.filter((framework) => exports.WEB_FRAMEWORKS_SIGNALS[framework].find((dep) => allDeps.includes(dep)));
}
exports.getFrameworksFromPackageJson = getFrameworksFromPackageJson;
async function detectFiles(dirPath, filePattern) {
    const options = {
        cwd: dirPath,
        ignore: [
            "**/dataconnect*/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/out/**",
            "**/.next/**",
            "**/coverage/**", // Test coverage reports
        ],
        absolute: false,
    };
    return (0, glob_1.glob)(`**/${filePattern}`, options);
}
