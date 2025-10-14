import { z } from "zod";
import * as path from "path";
import { tool } from "../../tool";
import { McpContext } from "../../types";
import { toContent } from "../../util";
import * as client from "../../../dataconnect/client";
import { loadAll } from "../../../dataconnect/load";
import { Service, Schema, ServiceInfo, Connector } from "../../../dataconnect/types";
import { dump } from "js-yaml";
import { logger } from "../../../logger";

interface CombinedServiceInfo {
  local?: ServiceInfo;
  deployed?: DeployServiceInfo;
}

interface DeployServiceInfo {
  service?: Service;
  schemas?: Schema[];
  connectors?: Connector[];
}

export const list_services = tool(
  {
    name: "list_services",
    description: "Use this to list existing local and backend Firebase Data Connect services",
    inputSchema: z.object({}),
    annotations: {
      title: "List existing Firebase Data Connect services",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: false,
      requiresAuth: false,
    },
    isAvailable: async (ctx: McpContext) => {
      return !!ctx.config?.get("dataconnect");
    },
  },
  async (_, { projectId, config }) => {
    const localServiceInfos = await loadAll(projectId, config);
    const serviceInfos = new Map<string, CombinedServiceInfo>();

    for (const l of localServiceInfos) {
      serviceInfos.set(
        `locations/${l.dataConnectYaml.location}/services/${l.dataConnectYaml.serviceId}`,
        { local: l },
      );
    }

    if (projectId) {
      try {
        const [services, schemas, connectors] = await Promise.all([
          client.listAllServices(projectId),
          client.listSchemas(`projects/${projectId}/locations/-/services/-`),
          client.listConnectors(`projects/${projectId}/locations/-/services/-`),
        ]);
        console.log(services, schemas, connectors);
        for (const s of services) {
          const k = s.name.split("/").slice(2, 6).join("/");
          const st = serviceInfos.get(k) || {};
          st.deployed = st.deployed || {};
          st.deployed.service = s;
          serviceInfos.set(k, st);
        }
        for (const s of schemas) {
          const k = s.name.split("/").slice(2, 6).join("/");
          const st = serviceInfos.get(k) || {};
          st.deployed = st.deployed || {};
          st.deployed.schemas = st.deployed.schemas || [];
          st.deployed.schemas.push(s);
          serviceInfos.set(k, st);
        }
        for (const s of connectors) {
          const k = s.name.split("/").slice(2, 6).join("/");
          const st = serviceInfos.get(k) || {};
          st.deployed = st.deployed || {};
          st.deployed.connectors = st.deployed.connectors || [];
          st.deployed.connectors.push(s);
          serviceInfos.set(k, st);
        }
      } catch (e: any) {
        logger.debug("cannot fetch dataconnect resources in the backend", e);
      }
    }

    const localServices = Array.from(serviceInfos.values()).filter((s) => s.local);
    const remoteOnlyServices = Array.from(serviceInfos.values()).filter((s) => !s.local);

    const output: string[] = [];

    function includeDeployedServiceInfo(deployed: DeployServiceInfo): void {
      if (deployed.schemas?.length) {
        output.push(`### Schemas`);
        for (const s of deployed.schemas) {
          clearCCFEFields(s);
          output.push(dump(s));
        }
      }
      if (deployed.connectors?.length) {
        output.push(`### Connectors`);
        for (const c of deployed.connectors) {
          clearCCFEFields(c);
          output.push(dump(c));
        }
      }
    }

    if (localServices.length) {
      output.push(`# Local Data Connect Sources`);
      for (const s of localServices) {
        const local = s.local!;
        output.push(dump(local.dataConnectYaml));
        const schemaDir = path.join(local.sourceDirectory, local.dataConnectYaml.schema.source);
        output.push(`You can find all of schema sources under ${schemaDir}/`);
        if (s.deployed) {
          output.push(`It's already deployed in the backend:\n`);
          includeDeployedServiceInfo(s.deployed);
        }
      }
    }

    if (remoteOnlyServices.length) {
      output.push(`# Data Connect Services in project ${projectId}`);
      for (const s of remoteOnlyServices) {
        if (s.deployed) {
          includeDeployedServiceInfo(s.deployed);
        }
      }
    }

    output.push(`\n# What's next?`);
    if (!localServices.length) {
      output.push(
        `- There is no local Data Connect service in the local workspace. Consider use the \`firebase_init\` MCP tool to setup one.`,
      );
    }
    output.push(
      `- You can use the \`dataconnect_compile\` tool to compile all local Data Connect schemas and query sources.`,
    );
    output.push(
      `- You run \`firebase deploy\` in command line to deploy the Data Connect schemas, connector and perform SQL migrations.`,
    );
    return toContent(output.join("\n"));
  },
);

function clearCCFEFields(r: any): void {
  const fieldsToClear = ["updateTime", "uid", "etag"];
  for (const k of fieldsToClear) {
    delete r[k];
  }
}
