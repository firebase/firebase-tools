import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import * as client from "../../../dataconnect/client";
import { loadAll } from "../../../dataconnect/load";
import { Service, Schema, ServiceInfo, Connector } from "../../../dataconnect/types";
import { connectorToText } from "../../util/dataconnect/converter";
import { schemaToText } from "../../util/dataconnect/converter";
import { fieldSize } from "tar";
import { logger } from "../../../logger";

interface ServiceStatus {
  local?: ServiceInfo;
  deployed?: DeployServiceStatus;
}

interface DeployServiceStatus {
  service?: Service;
  schemas?: Schema[];
  connectors?: Connector[];
}

export const status = tool(
  {
    name: "status",
    description: "Get status about the Firebase Data Connect local and deployed sources.",
    inputSchema: z.object({
      include_schema_source: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include Data Connect schema details."),
      include_connector_source: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include Data Connect connector details."),
    }),
    annotations: {
      title: "Get project status about Firebase Data Connect",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: false,
      requiresAuth: false,
    },
  },
  async ({ include_connector_source, include_schema_source }, { projectId, config }) => {
    const localServices = await loadAll(projectId, config);
    const serviceStatuses = new Map<string, ServiceStatus>();

    for (const l of localServices) {
      serviceStatuses.set(
        `locations/${l.dataConnectYaml.location}/services/${l.dataConnectYaml.serviceId}`,
        { local: l },
      );
    }

    if (projectId) {
      try {
        const [services, schemas, connectors] = await Promise.all([
          client.listAllServices(projectId),
          client.listSchemas(
            `projects/${projectId}/services/-`,
            include_schema_source ? ["datasources", "source"] : ["datasources"],
          ),
          client.listConnectors(
            `projects/${projectId}/services/-`,
            include_connector_source ? ["source"] : [],
          ),
        ]);
        console.log(services, schemas, connectors);
        for (const s of services) {
          const k = s.name.split("/").slice(2, 4).join("/");
          const st = serviceStatuses.get(k) || {};
          st.deployed = st.deployed || {};
          st.deployed.service = s;
          serviceStatuses.set(k, st);
        }
        for (const s of schemas) {
          const k = s.name.split("/").slice(2, 4).join("/");
          const st = serviceStatuses.get(k) || {};
          st.deployed = st.deployed || {};
          st.deployed.schemas = st.deployed.schemas || [];
          st.deployed.schemas.push(s);
          serviceStatuses.set(k, st);
        }
        for (const s of connectors) {
          const k = s.name.split("/").slice(2, 4).join("/");
          const st = serviceStatuses.get(k) || {};
          st.deployed = st.deployed || {};
          st.deployed.connectors = st.deployed.connectors || [];
          st.deployed.connectors.push(s);
          serviceStatuses.set(k, st);
        }
      } catch (e: any) {
        logger.debug("Cannot fetch dataconnect resources");
      }
    }


    const output: string[] = [];

    return toContent(output.join("\n"));
  },
);
