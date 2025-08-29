import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import * as client from "../../../dataconnect/client";
import { loadAll } from "../../../dataconnect/load";
import { Service, ServiceInfo, Connector } from "../../../dataconnect/types";
import { connectorToText } from "../../util/dataconnect/converter";
import { schemaToText } from "../../util/dataconnect/converter";

interface ServiceStatus {
  local?: ServiceInfo;
  remote?: Service;
}

export const dataconnect_info = tool(
  {
    name: "dataconnect_info",
    description:
      "Get information about the Firebase Data Connect services in the project and in the local workspace.",
    inputSchema: z.object({}),
    annotations: {
      title: "Get Data Connect Information",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (_, { projectId, config }) => {
    const remoteServices = await client.listAllServices(projectId);
    const localServices = await loadAll(projectId, config);

    const serviceStatuses = new Map<string, ServiceStatus>();

    for (const ls of localServices) {
      const serviceId = ls.dataConnectYaml.serviceId;
      if (!serviceStatuses.has(serviceId)) {
        serviceStatuses.set(serviceId, {});
      }
      serviceStatuses.get(serviceId)!.local = ls;
    }

    for (const rs of remoteServices) {
      const serviceId = rs.name.split("/").pop()!;
      if (!serviceStatuses.has(serviceId)) {
        serviceStatuses.set(serviceId, {});
      }
      serviceStatuses.get(serviceId)!.remote = rs;
    }

    const output: string[] = [];

    output.push("Services in local workspace (firebase.json):");
    const localServiceIds = localServices.map((ls) => ls.dataConnectYaml.serviceId);
    if (localServiceIds.length === 0) {
      output.push("  No services found in firebase.json.");
    } else {
      for (const serviceId of localServiceIds) {
        const status = serviceStatuses.get(serviceId)!;
        const location = status.local?.dataConnectYaml.location ?? "unknown";
        const source = status.local?.sourceDirectory ?? "unknown";
        const existsRemotely = status.remote ? "exists remotely" : "does not exist remotely";
        output.push(
          `- ${serviceId} (location: ${location}, source: ${source}) - ${existsRemotely}`,
        );
      }
    }

    const remoteOnlyServices = remoteServices.filter((rs) => {
      const serviceId = rs.name.split("/").pop()!;
      return !serviceStatuses.get(serviceId)?.local;
    });

    if (remoteOnlyServices.length > 0) {
      output.push("\nServices in Google Cloud Project (not in local workspace):");
      for (const rs of remoteOnlyServices) {
        output.push(`- ${rs.name}`);
      }
    }

    for (const serviceId of localServiceIds) {
      const status = serviceStatuses.get(serviceId)!;
      if (status.local) {
        output.push(`\nDetails for service ${serviceId}:`);
        output.push("  Schema (from local source):");
        output.push(
          schemaToText(status.local.schema)
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
        );

        const localConnectors = new Map<string, Connector>();
        for (const ci of status.local.connectorInfo) {
          localConnectors.set(ci.connectorYaml.connectorId, ci.connector);
        }
        const remoteConnectors = await client.listConnectors(status.local.serviceName, ["*"]);
        const remoteConnectorIds = new Set(remoteConnectors.map((rc) => rc.name.split("/").pop()!));

        output.push("  Connectors:");
        for (const [connectorId, connector] of localConnectors.entries()) {
          const existsRemotely = remoteConnectorIds.has(connectorId)
            ? "exists remotely"
            : "does not exist remotely";
          output.push(`    - ${connectorId} (from local source) - ${existsRemotely}`);
          output.push(
            connectorToText(connector)
              .split("\n")
              .map((l) => `      ${l}`)
              .join("\n"),
          );
        }

        for (const rc of remoteConnectors) {
          const connectorId = rc.name.split("/").pop()!;
          if (!localConnectors.has(connectorId)) {
            output.push(`    - ${connectorId} (from remote source only)`);
            output.push(
              connectorToText(rc)
                .split("\n")
                .map((l) => `      ${l}`)
                .join("\n"),
            );
          }
        }
      }
    }

    for (const rs of remoteOnlyServices) {
      const serviceId = rs.name.split("/").pop()!;
      output.push(`\nDetails for service ${serviceId} (from remote source only):`);
      const schemas = await client.listSchemas(rs.name, ["*"]);
      output.push("  Schema:");
      if (schemas && schemas.length > 0) {
        output.push(
          schemas
            .map((s) =>
              schemaToText(s)
                .split("\n")
                .map((l) => `    ${l}`)
                .join("\n"),
            )
            .join("\n\n"),
        );
      } else {
        output.push("    No schemas found for this service.");
      }

      const connectors = await client.listConnectors(rs.name, ["*"]);
      output.push("  Connectors:");
      if (connectors.length > 0) {
        output.push(
          connectors
            .map((c) =>
              connectorToText(c)
                .split("\n")
                .map((l) => `    ${l}`)
                .join("\n"),
            )
            .join("\n\n"),
        );
      } else {
        output.push("    No connectors found for this service.");
      }
    }

    return toContent(output.join("\n"));
  },
);
