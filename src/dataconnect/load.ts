import * as path from "path";
import * as fileUtils from "./fileUtils";
import { ServiceInfo, toDatasource, SCHEMA_ID } from "./types";

/**
 * loads schemas and connectors from  {sourceDirectory}/dataconnect.yaml
 */
export async function load(
  projectId: string,
  locationId: string,
  sourceDirectory: string,
): Promise<ServiceInfo> {
  const dataConnectYaml = await fileUtils.readDataConnectYaml(sourceDirectory);
  const serviceName = `projects/${projectId}/locations/${locationId}/services/${dataConnectYaml.serviceId}`;
  const schemaDir = path.join(sourceDirectory, dataConnectYaml.schema.source);
  const schemaGQLs = await fileUtils.readGQLFiles(schemaDir);
  const connectorInfo = await Promise.all(
    dataConnectYaml.connectorDirs.map(async (dir) => {
      const connectorDir = path.join(sourceDirectory, dir);
      const connectorYaml = await fileUtils.readConnectorYaml(connectorDir);
      const connectorGqls = await fileUtils.readGQLFiles(connectorDir);
      return {
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
    sourceDirectory,
    schema: {
      name: `${serviceName}/schemas/${SCHEMA_ID}`,
      primaryDatasource: toDatasource(projectId, locationId, dataConnectYaml.schema.datasource),
      source: {
        files: schemaGQLs,
      },
    },
    dataConnectYaml,
    connectorInfo,
  };
}
