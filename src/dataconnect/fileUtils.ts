import * as fs from "fs-extra";
import * as path from "path";

import { FirebaseError } from "../error";
import {
  ConnectorYaml,
  DataConnectYaml,
  File,
  Platform,
  ServiceInfo,
  SupportedFrameworks,
} from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config } from "../config";
import { DataConnectMultiple } from "../firebaseConfig";
import { load } from "./load";
import { PackageJSON } from "../frameworks/compose/discover/runtime/node";

export function readFirebaseJson(config?: Config): DataConnectMultiple {
  if (!config?.has("dataconnect")) {
    return [];
  }
  const validator = (cfg: any) => {
    if (!cfg["source"]) {
      throw new FirebaseError("Invalid firebase.json: DataConnect requires `source`");
    }
    return {
      source: cfg["source"],
    };
  };
  const configs = config.get("dataconnect");
  if (typeof configs === "object" && !Array.isArray(configs)) {
    return [validator(configs)];
  } else if (Array.isArray(configs)) {
    return configs.map(validator);
  } else {
    throw new FirebaseError(
      "Invalid firebase.json: dataconnect should be of the form { source: string }",
    );
  }
}

export async function readDataConnectYaml(sourceDirectory: string): Promise<DataConnectYaml> {
  const file = await readFileFromDirectory(sourceDirectory, "dataconnect.yaml");
  const dataconnectYaml = await wrappedSafeLoad(file.source);
  return validateDataConnectYaml(dataconnectYaml);
}

function validateDataConnectYaml(unvalidated: any): DataConnectYaml {
  // TODO: Use json schema for validation here!
  if (!unvalidated["location"]) {
    throw new FirebaseError("Missing required field 'location' in dataconnect.yaml");
  }
  return unvalidated as DataConnectYaml;
}

export async function readConnectorYaml(sourceDirectory: string): Promise<ConnectorYaml> {
  const file = await readFileFromDirectory(sourceDirectory, "connector.yaml");
  const connectorYaml = await wrappedSafeLoad(file.source);
  return validateConnectorYaml(connectorYaml);
}

function validateConnectorYaml(unvalidated: any): ConnectorYaml {
  // TODO: Add validation
  return unvalidated as ConnectorYaml;
}

export async function readGQLFiles(sourceDir: string): Promise<File[]> {
  if (!fs.existsSync(sourceDir)) {
    return [];
  }
  const files = await fs.readdir(sourceDir);
  // TODO: Handle files in subdirectories such as `foo/a.gql` and `bar/baz/b.gql`.
  return files
    .filter((f) => f.endsWith(".gql") || f.endsWith(".graphql"))
    .map((f) => toFile(sourceDir, f));
}

function toFile(sourceDir: string, relPath: string): File {
  const fullPath = path.join(sourceDir, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new FirebaseError(`file ${fullPath} not found`);
  }
  const content = fs.readFileSync(fullPath).toString();
  return {
    path: relPath,
    content,
  };
}

// pickService reads firebase.json and returns all services with a given serviceId.
// If serviceID is not provided and there is a single service, return that.
export async function pickService(
  projectId: string,
  config: Config,
  serviceId?: string,
): Promise<ServiceInfo> {
  const serviceCfgs = readFirebaseJson(config);
  let serviceInfo: ServiceInfo;
  if (serviceCfgs.length === 0) {
    throw new FirebaseError("No Data Connect services found in firebase.json.");
  } else if (serviceCfgs.length === 1) {
    serviceInfo = await load(projectId, config, serviceCfgs[0].source);
  } else {
    if (!serviceId) {
      throw new FirebaseError(
        "Multiple Data Connect services found in firebase.json. Please specify a service ID to use.",
      );
    }
    const infos = await Promise.all(serviceCfgs.map((c) => load(projectId, config, c.source)));
    // TODO: handle cases where there are services with the same ID in 2 locations.
    const maybe = infos.find((i) => i.dataConnectYaml.serviceId === serviceId);
    if (!maybe) {
      throw new FirebaseError(`No service named ${serviceId} declared in firebase.json.`);
    }
    serviceInfo = maybe;
  }
  return serviceInfo;
}

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
