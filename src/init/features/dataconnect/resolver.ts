import * as clc from "colorette";
import * as fs from "fs-extra";
import { join, relative } from "path";
import * as yaml from "yaml";

import { input, select } from "../../../prompt";
import { Setup } from "../..";
import { newUniqueId } from "../../../utils";
import { Config } from "../../../config";
import { loadAll } from "../../../dataconnect/load";
import { DataConnectYaml, SchemaYaml, ServiceInfo } from "../../../dataconnect/types";
import { parseServiceName } from "../../../dataconnect/names";
import * as experiments from "../../../experiments";
import { isBillingEnabled } from "../../../gcp/cloudbilling";
import { trackGA4 } from "../../../track";
import { Source } from ".";

export interface ResolverRequiredInfo {
  id: string;
  uri: string;
  serviceInfo: ServiceInfo;
}

export async function askQuestions(setup: Setup, config: Config): Promise<void> {
  if (!experiments.isEnabled("fdcwebhooks")) {
    throw new Error("Unsupported command.");
  }
  const resolverInfo: ResolverRequiredInfo = {
    id: "",
    uri: "",
    serviceInfo: {} as ServiceInfo,
  };

  const serviceInfos = await loadAll(setup.projectId || "", config);
  if (!serviceInfos.length) {
    throw new Error(
      `No Firebase Data Connect workspace found. Run ${clc.bold("firebase init dataconnect")} to set up a service and main schema.`,
    );
  } else if (serviceInfos.length === 1) {
    resolverInfo.serviceInfo = serviceInfos[0];
  } else {
    const choices: Array<{ name: string; value: ServiceInfo }> = serviceInfos.map((si) => {
      const serviceName = parseServiceName(si.serviceName);
      return {
        name: `${serviceName.location}/${serviceName.serviceId}`,
        value: si,
      };
    });
    resolverInfo.serviceInfo = await select<ServiceInfo>({
      message: "Which service would you like to set up a custom resolver for?",
      choices,
    });
  }

  resolverInfo.id = await input({
    message: `What ID would you like to use for your custom resolver?`,
    default: newUniqueId(
      `resolver`,
      resolverInfo.serviceInfo.dataConnectYaml.schemas?.map((sch) => sch.id || "") || [],
    ),
  });
  resolverInfo.uri = await input({
    message: `What is the URL of your Cloud Run data source that implements your custom resolver?`,
    default: `https://${resolverInfo.id}-${setup.projectNumber || "PROJECT_NUMBER"}.${resolverInfo.serviceInfo.dataConnectYaml.location}.run.app/graphql`,
  });

  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.dataconnectResolver = resolverInfo;
}

export async function actuate(setup: Setup, config: Config) {
  if (!experiments.isEnabled("fdcwebhooks")) {
    return;
  }
  const resolverInfo = setup.featureInfo?.dataconnectResolver;
  if (!resolverInfo) {
    throw new Error("Data Connect resolver feature ResolverRequiredInfo not provided");
  }
  const startTime = Date.now();
  try {
    actuateWithInfo(config, resolverInfo);
  } finally {
    const source: Source = "init_resolver";
    void trackGA4(
      "dataconnect_init",
      {
        source,
        project_status: setup.projectId
          ? (await isBillingEnabled(setup))
            ? "blaze"
            : "spark"
          : "missing",
        ...{},
      },
      Date.now() - startTime,
    );
  }
}

function actuateWithInfo(config: Config, info: ResolverRequiredInfo) {
  const dataConnectYaml = JSON.parse(
    JSON.stringify(info.serviceInfo?.dataConnectYaml),
  ) as DataConnectYaml;
  addSchemaToDataConnectYaml(dataConnectYaml, info);
  info.serviceInfo.dataConnectYaml = dataConnectYaml;
  const dataConnectYamlContents = yaml.stringify(dataConnectYaml);
  const dataConnectYamlPath = join(info.serviceInfo.sourceDirectory, "dataconnect.yaml");
  config.writeProjectFile(
    relative(config.projectDir, dataConnectYamlPath),
    dataConnectYamlContents,
  );

  // Write an empty schema.gql file.
  fs.ensureFileSync(join(info.serviceInfo.sourceDirectory, `schema_${info.id}`, "schema.gql"));
}

/** Add secondary schema configuration to dataconnect.yaml in place */
export function addSchemaToDataConnectYaml(
  dataConnectYaml: DataConnectYaml,
  info: ResolverRequiredInfo,
): void {
  const secondarySchema: SchemaYaml = {
    source: `./schema_${info.id}`,
    id: info.id,
    datasource: {
      httpGraphql: {
        uri: info.uri,
      },
    },
  };
  if (!dataConnectYaml.schemas) {
    dataConnectYaml.schemas = [];
    if (dataConnectYaml.schema) {
      dataConnectYaml.schemas.push(dataConnectYaml.schema);
      dataConnectYaml.schema = undefined;
    }
  }
  dataConnectYaml.schemas.push(secondarySchema);
}
