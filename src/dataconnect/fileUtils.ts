import * as fs from "fs-extra";
import * as path from "path";

import { FirebaseError } from "../error";
import { ConnectorYaml, DataConnectYaml, File, Platform, ServiceInfo } from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config } from "../config";
import { DataConnectMultiple } from "../firebaseConfig";
import { load } from "./load";

export function readFirebaseJson(config: Config): DataConnectMultiple {
  if (!config.has("dataconnect")) {
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
const IOS_INDICATORS = ["info.plist", "podfile", "package.swift"];
const ANDROID_INDICATORS = ["androidmanifest.xml", "build.gradle"];

// endswith match
const IOS_INDICATORS_2 = [".xcworkspace", ".xcodeproj"];

// given a directory, determine the platform type
export async function getPlatformFromFolder(dirPath: string) {
  // Check for file indicators
  const fileNames = await fs.readdir(dirPath);

  for (const fileName of fileNames) {
    const cleanedFileName = fileName.toLowerCase();
    if (WEB_INDICATORS.some((indicator) => indicator === cleanedFileName)) return Platform.WEB;
    if (ANDROID_INDICATORS.some((indicator) => indicator === cleanedFileName))
      return Platform.ANDROID;
    if (IOS_INDICATORS.some((indicator) => indicator === cleanedFileName)) return Platform.IOS;
    if (IOS_INDICATORS_2.some((indicator) => cleanedFileName.endsWith(indicator)))
      return Platform.IOS;
  }

  return Platform.UNDETERMINED;
}
