import * as path from "path";
import * as fileUtils from "./fileUtils";
import { Config } from "../config";
import { ServiceInfo, toDatasource, SCHEMA_ID } from "./types";
import { readFirebaseJson } from "./fileUtils";

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
  const dataConnectYaml = await fileUtils.readDataConnectYaml(resolvedDir);
  const serviceName = `projects/${projectId}/locations/${dataConnectYaml.location}/services/${dataConnectYaml.serviceId}`;
  const schemaDir = path.join(resolvedDir, dataConnectYaml.schema.source);
  const schemaGQLs = await fileUtils.readGQLFiles(schemaDir);
  const connectorInfo = await Promise.all(
    dataConnectYaml.connectorDirs.map(async (dir) => {
      const connectorDir = path.join(resolvedDir, dir);
      const connectorYaml = await fileUtils.readConnectorYaml(connectorDir);
      const connectorGqls = await fileUtils.readGQLFiles(connectorDir);
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
