import * as clc from "colorette";
import * as fs from "fs-extra";
import { join, relative } from "path";
import * as yaml from "yaml";

import { input, select } from "../../../prompt";
import { Setup } from "../..";
import { newUniqueId } from "../../../utils";
import { Config } from "../../../config";
import { FDC_DEFAULT_REGION } from ".";
import { loadAll } from "../../../dataconnect/load";
import { DataConnectYaml, SchemaYaml, ServiceInfo } from "../../../dataconnect/types";
import { parseServiceName } from "../../../dataconnect/names";
import * as experiments from "../../../experiments";
import { isBillingEnabled } from "../../../gcp/cloudbilling";
import { trackGA4 } from "../../../track";
import { Source } from ".";

export interface SchemaRequiredInfo {
  id: string;
  uri: string;
  serviceInfo: ServiceInfo;
}

export async function askQuestions(setup: Setup, config: Config): Promise<void> {
  if (!experiments.isEnabled("fdcwebhooks")) {
    throw new Error("Unsupported command.");
  }
  const schemaInfo: SchemaRequiredInfo = {
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
    schemaInfo.serviceInfo = serviceInfos[0];
  } else {
    const choices: Array<{ name: string; value: ServiceInfo }> = serviceInfos.map((si) => {
      const serviceName = parseServiceName(si.serviceName);
      return {
        name: `${serviceName.location}/${serviceName.serviceId}`,
        value: si,
      };
    });
    schemaInfo.serviceInfo = await select<ServiceInfo>({
      message: "Which service would you like to set up a secondary schema for?",
      choices,
    });
  }

  schemaInfo.id = await input({
    message: `What ID would you like to use for your secondary schema?`,
    default: newUniqueId(
      `resolver`,
      schemaInfo.serviceInfo.dataConnectYaml.schemas?.map((sch) => sch.id || "") || [],
    ),
  });
  schemaInfo.uri = await input({
    message: `What is the URL of your Cloud Run data source that implements your secondary schema?`,
    default: `https://${schemaInfo.id}-${setup.projectNumber || "PROJECT_NUMBER"}.${FDC_DEFAULT_REGION}.run.app/graphql`,
  });

  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.dataconnectSchema = schemaInfo;
}

export async function actuate(setup: Setup, config: Config) {
  if (!experiments.isEnabled("fdcwebhooks")) {
    return;
  }
  const schemaInfo = setup.featureInfo?.dataconnectSchema;
  if (!schemaInfo) {
    throw new Error("Data Connect schema feature SchemaRequiredInfo not provided");
  }
  const startTime = Date.now();
  try {
    actuateWithInfo(config, schemaInfo);
  } finally {
    const source: Source = setup.featureInfo?.dataconnectSource || "init_schema";
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

function actuateWithInfo(config: Config, info: SchemaRequiredInfo) {
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

function addSchemaToDataConnectYaml(
  dataConnectYaml: DataConnectYaml,
  info: SchemaRequiredInfo,
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
