import * as path from "path";
import * as fs from "fs-extra";
import * as clc from "colorette";
import { glob } from "glob";

import { Config } from "../config";
import { FirebaseError } from "../error";
import {
  toDatasource,
  SCHEMA_ID,
  ConnectorYaml,
  DataConnectYaml,
  File,
  ServiceInfo,
  Source,
} from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { DataConnectMultiple } from "../firebaseConfig";

// pickService reads firebase.json and returns all services with a given serviceId.
// If serviceID is not provided and there is a single service, return that.
export async function pickService(
  projectId: string,
  config: Config,
  serviceId?: string,
): Promise<ServiceInfo> {
  const serviceInfos = await loadAll(projectId, config);
  if (serviceInfos.length === 0) {
    throw new FirebaseError(
      "No Data Connect services found in firebase.json." +
        `\nYou can run ${clc.bold("firebase init dataconnect")} to add a Data Connect service.`,
    );
  } else if (serviceInfos.length === 1) {
    if (serviceId && serviceId !== serviceInfos[0].dataConnectYaml.serviceId) {
      throw new FirebaseError(
        `No service named ${serviceId} declared in firebase.json. Found ${serviceInfos[0].dataConnectYaml.serviceId}.` +
          `\nYou can run ${clc.bold("firebase init dataconnect")} to add this Data Connect service.`,
      );
    }
    return serviceInfos[0];
  } else {
    if (!serviceId) {
      throw new FirebaseError(
        "Multiple Data Connect services found in firebase.json. Please specify a service ID to use.",
      );
    }
    // TODO: handle cases where there are services with the same ID in 2 locations.
    const maybe = serviceInfos.find((i) => i.dataConnectYaml.serviceId === serviceId);
    if (!maybe) {
      const serviceIds = serviceInfos.map((i) => i.dataConnectYaml.serviceId);
      throw new FirebaseError(
        `No service named ${serviceId} declared in firebase.json. Found ${serviceIds.join(", ")}.` +
          `\nYou can run ${clc.bold("firebase init dataconnect")} to add this Data Connect service.`,
      );
    }
    return maybe;
  }
}

/**
 * Loads all Data Connect service configurations from the firebase.json file.
 */
export async function loadAll(projectId: string, config: Config): Promise<ServiceInfo[]> {
  const serviceCfgs = readFirebaseJson(config);
  return await Promise.all(serviceCfgs.map((c) => load(projectId, config, c.source)));
}

/**
 * loads schemas and connectors from  {sourceDirectory}/dataconnect.yaml
 */
export async function load(
  projectId: string,
  config: Config,
  sourceDirectory: string,
): Promise<ServiceInfo> {
  // TODO: better error handling when config read fails
  const resolvedDir = config.path(sourceDirectory);
  const dataConnectYaml = await readDataConnectYaml(resolvedDir);
  const serviceName = `projects/${projectId}/locations/${dataConnectYaml.location}/services/${dataConnectYaml.serviceId}`;
  const schemaDir = path.join(resolvedDir, dataConnectYaml.schema.source);
  const schemaGQLs = await readGQLFiles(schemaDir);
  const connectorInfo = await Promise.all(
    dataConnectYaml.connectorDirs.map(async (dir) => {
      const connectorDir = path.join(resolvedDir, dir);
      const connectorYaml = await readConnectorYaml(connectorDir);
      const connectorGqls = await readGQLFiles(connectorDir);
      return {
        directory: connectorDir,
        connectorYaml,
        connector: {
          name: `${serviceName}/connectors/${connectorYaml.connectorId}`,
          source: {
            files: connectorGqls,
          },
        },
      };
    }),
  );

  return {
    serviceName,
    sourceDirectory: resolvedDir,
    schema: {
      name: `${serviceName}/schemas/${SCHEMA_ID}`,
      datasources: [
        toDatasource(projectId, dataConnectYaml.location, dataConnectYaml.schema.datasource),
      ],
      source: {
        files: schemaGQLs,
      },
    },
    dataConnectYaml,
    connectorInfo,
  };
}

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
  const files = await glob("**/*.{gql,graphql}", { cwd: sourceDir, absolute: true, nodir: true });
  return files.map((f) => toFile(sourceDir, f));
}

function toFile(sourceDir: string, fullPath: string): File {
  const relPath = path.relative(sourceDir, fullPath);
  if (!fs.existsSync(fullPath)) {
    throw new FirebaseError(`file ${fullPath} not found`);
  }
  const content = fs.readFileSync(fullPath).toString();
  return {
    path: relPath,
    content,
  };
}

/**
 * Combine the contents in all GQL files into a string.
 * @return combined file contents, possible deliminated by boundary comments.
 */
export function squashGraphQL(source: Source): string {
  if (!source.files || !source.files.length) {
    return "";
  }
  if (source.files.length === 1) {
    return source.files[0].content;
  }
  let query = "";
  for (const f of source.files) {
    if (!f.content || !/\S/.test(f.content)) {
      continue; // Empty or space-only file.
    }
    query += `### Begin file ${f.path}\n`;
    query += f.content;
    query += `### End file ${f.path}\n`;
  }
  return query;
}
