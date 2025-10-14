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
} from "./types";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { DataConnectMultiple } from "../firebaseConfig";

/** Picks exactly one Data Connect service based on flags. */
export async function pickOneService(
  projectId: string,
  config: Config,
  service?: string,
  location?: string,
): Promise<ServiceInfo> {
  const services = await pickServices(projectId, config, service, location);
  if (services.length > 1) {
    const serviceIds = services.map(
      (i) => `${i.dataConnectYaml.location}:${i.dataConnectYaml.serviceId}`,
    );
    throw new FirebaseError(
      `Multiple services matched. Please specify a service and location. Matched services: ${serviceIds.join(
        ", ",
      )}`,
    );
  }
  return services[0];
}

/** Picks Data Connect services based on flags. */
export async function pickServices(
  projectId: string,
  config: Config,
  serviceId?: string,
  location?: string,
): Promise<ServiceInfo[]> {
  const serviceInfos = await loadAll(projectId, config);
  if (serviceInfos.length === 0) {
    throw new FirebaseError(
      "No Data Connect services found in firebase.json." +
        `\nYou can run ${clc.bold("firebase init dataconnect")} to add a Data Connect service.`,
    );
  }

  const matchingServices = serviceInfos.filter(
    (i) =>
      (!serviceId || i.dataConnectYaml.serviceId === serviceId) &&
      (!location || i.dataConnectYaml.location === location),
  );
  if (matchingServices.length === 0) {
    const serviceIds = serviceInfos.map(
      (i) => `${i.dataConnectYaml.location}:${i.dataConnectYaml.serviceId}`,
    );
    throw new FirebaseError(
      `No service matched service in firebase.json. Available services: ${serviceIds.join(", ")}`,
    );
  }
  return matchingServices;
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

async function readGQLFiles(sourceDir: string): Promise<File[]> {
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
