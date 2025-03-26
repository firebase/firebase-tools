import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as names from "../dataconnect/names";
import * as client from "../dataconnect/client";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import * as Table from "cli-table3";

export const command = new Command("dataconnect:services:list")
  .description("list all deployed Data Connect services")
  .before(requirePermissions, [
    "dataconnect.services.list",
    "dataconnect.schemas.list",
    "dataconnect.connectors.list",
  ])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const services = await client.listAllServices(projectId);
    const table: Record<string, any>[] = new Table({
      head: [
        "Service ID",
        "Location",
        "Data Source",
        "Schema Last Updated",
        "Connector ID",
        "Connector Last Updated",
      ],
      style: { head: ["yellow"] },
    });
    const jsonOutput: { services: Record<string, any>[] } = { services: [] };
    for (const service of services) {
      const schema = (await client.getSchema(service.name)) ?? {
        name: "",
        datasources: [{}],
        source: { files: [] },
      };
      const connectors = await client.listConnectors(service.name);
      const serviceName = names.parseServiceName(service.name);
      const postgresDatasource = schema?.datasources.find((d) => d.postgresql);
      const instanceName = postgresDatasource?.postgresql?.cloudSql.instance ?? "";
      const instanceId = instanceName.split("/").pop();
      const dbId = postgresDatasource?.postgresql?.database ?? "";
      const dbName = `CloudSQL Instance: ${instanceId}\nDatabase: ${dbId}`;
      table.push([
        serviceName.serviceId,
        serviceName.location,
        dbName,
        schema?.updateTime ?? "",
        "",
        "",
      ]);
      const serviceJson = {
        serviceId: serviceName.serviceId,
        location: serviceName.location,
        datasource: dbName,
        schemaUpdateTime: schema?.updateTime,
        connectors: [] as { connectorId: string; connectorLastUpdated: string }[],
      };
      for (const conn of connectors) {
        const connectorName = names.parseConnectorName(conn.name);
        table.push(["", "", "", "", connectorName.connectorId, conn.updateTime]);
        serviceJson.connectors.push({
          connectorId: connectorName.connectorId,
          connectorLastUpdated: conn.updateTime ?? "",
        });
      }
      jsonOutput.services.push(serviceJson);
    }
    logger.info(table.toString());
    return jsonOutput;
  });
