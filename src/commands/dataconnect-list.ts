import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as names from "../dataconnect/names";
import * as client from "../dataconnect/client";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
const Table = require("cli-table");

export const command = new Command("dataconnect:list")
  .description("list all deployed services in your Firebase project")
  .before(requirePermissions, [
    "dataconnect.services.list",
    "dataconnect.schemas.list",
    "dataconnect.connectors.list",
  ])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
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
      const schema = await client.getSchema(service.name);
      const connectors = await client.listConnectors(service.name);
      const serviceName = names.parseServiceName(service.name);
      const instanceName = schema?.primaryDatasource.postgresql?.cloudSql.instance ?? "";
      const dbId = schema?.primaryDatasource.postgresql?.database ?? "";
      const dbName = `${instanceName}/databases/${dbId}`;
      table.push([serviceName.serviceId, serviceName.location, dbName, schema?.updateTime, "", ""]);
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
