import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import * as client from "../../../dataconnect/client";
import { loadAll } from "../../../dataconnect/load";
import { ServiceInfo } from "../../../dataconnect/types";
import { connectorToText } from "../../util/dataconnect/converter";
import { schemaToText } from "../../util/dataconnect/converter";

export const dataconnect_info = tool(
  {
    name: "dataconnect_info",
    description: "Get information about the Firebase Data Connect services in the project and in the local workspace.",
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

    const output: string[] = [];

    output.push("Services in firebase.json:");
    if (localServices.length === 0) {
      output.push("  No services found in firebase.json.");
    } else {
      for (const service of localServices) {
        output.push(`- ${service.dataConnectYaml.serviceId} (location: ${service.dataConnectYaml.location}, source: ${service.sourceDirectory})`);
      }
    }

    output.push("\nServices in Google Cloud Project:");
    if (remoteServices.length === 0) {
        output.push("  No services found in the project.");
    } else {
      for (const service of remoteServices) {
        output.push(`- ${service.name}`);
      }
    }

    const localServiceInfos = new Map<string, ServiceInfo>();
    for (const service of localServices) {
      localServiceInfos.set(service.dataConnectYaml.serviceId, service);
    }

    for (const service of localServices) {
        output.push(`\nDetails for service ${service.dataConnectYaml.serviceId} from local source:`);
        output.push("Schema:");
        output.push(schemaToText(service.schema));
        output.push("Connectors:");
        for (const connectorInfo of service.connectorInfo) {
            output.push(connectorToText(connectorInfo.connector));
        }
    }

    for (const remote of remoteServices) {
      const serviceId = remote.name.split("/").pop()!;
      if (localServiceInfos.has(serviceId)) {
        // Already displayed from local source
        continue;
      }
      output.push(`\nDetails for service ${serviceId} from GCP:`);
      const schemas = await client.listSchemas(remote.name, ["*"]);
      output.push("Schema:");
      output.push(schemas?.map(schemaToText).join("\n\n"));

      const connectors = await client.listConnectors(remote.name, ["*"]);
      output.push("Connectors:");
      output.push(connectors.map(connectorToText).join("\n\n"));
    }


    return toContent(output.join('\n'));
  },
);
