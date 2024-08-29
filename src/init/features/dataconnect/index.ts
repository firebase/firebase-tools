import { join } from "path";
import * as clc from "colorette";

import { confirm, promptOnce } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";
import { provisionCloudSql } from "../../../dataconnect/provisionCloudSql";
import { checkForFreeTrialInstance } from "../../../dataconnect/freeTrial";
import * as cloudsql from "../../../gcp/cloudsql/cloudsqladmin";
import { ensureApis } from "../../../dataconnect/ensureApis";
import {
  listLocations,
  listAllServices,
  getSchema,
  listConnectors,
} from "../../../dataconnect/client";
import { Schema, Service, File } from "../../../dataconnect/types";
import { DEFAULT_POSTGRES_CONNECTION } from "../emulators";
import { parseCloudSQLInstanceName, parseServiceName } from "../../../dataconnect/names";
import { logger } from "../../../logger";
import { readTemplateSync } from "../../../templates";
import { logSuccess } from "../../../utils";

const DATACONNECT_YAML_TEMPLATE = readTemplateSync("init/dataconnect/dataconnect.yaml");
const CONNECTOR_YAML_TEMPLATE = readTemplateSync("init/dataconnect/connector.yaml");
const SCHEMA_TEMPLATE = readTemplateSync("init/dataconnect/schema.gql");
const QUERIES_TEMPLATE = readTemplateSync("init/dataconnect/queries.gql");
const MUTATIONS_TEMPLATE = readTemplateSync("init/dataconnect/mutations.gql");

export interface RequiredInfo {
  serviceId: string;
  locationId: string;
  cloudSqlInstanceId: string;
  cloudSqlDatabase: string;
  connectors: {
    id: string;
    path: string;
    files: File[];
  }[];
  isNewInstance: boolean;
  isNewDatabase: boolean;
  schemaGql: File[];
  shouldProvisionCSQL: boolean;
}

const defaultConnector = {
  id: "default",
  path: "./connector",
  files: [
    {
      path: "queries.gql",
      content: QUERIES_TEMPLATE,
    },
    {
      path: "mutations.gql",
      content: MUTATIONS_TEMPLATE,
    },
  ],
};

// doSetup is split into 2 phases - ask questions and then actuate files and API calls based on those answers.
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const info = await askQuestions(setup, config);
  await actuate(setup, config, info);
  logger.info("");
  logSuccess(
    `If you'd like to generate an SDK for your new connector, run ${clc.bold("firebase init dataconnect:sdk")}`,
  );
}

// askQuestions prompts the user about the Data Connect service they want to init. Any prompting
// logic should live here, and _no_ actuation logic should live here.
async function askQuestions(setup: Setup, config: Config): Promise<RequiredInfo> {
  let info: RequiredInfo = {
    serviceId: "",
    locationId: "",
    cloudSqlInstanceId: "",
    isNewInstance: false,
    cloudSqlDatabase: "",
    isNewDatabase: false,
    connectors: [defaultConnector],
    schemaGql: [],
    shouldProvisionCSQL: false,
  };
  info = await promptForService(setup, info);

  if (info.cloudSqlInstanceId === "") {
    info = await promptForCloudSQLInstance(setup, info);
  }

  if (info.cloudSqlDatabase === "") {
    info = await promptForDatabase(setup, config, info);
  }

  // TODO: Remove this in favor of a better way of setting local connection string.
  const defaultConnectionString =
    setup.rcfile.dataconnectEmulatorConfig?.postgres?.localConnectionString ??
    DEFAULT_POSTGRES_CONNECTION;
  // TODO: Download Postgres
  const localConnectionString = await promptOnce({
    type: "input",
    name: "localConnectionString",
    message: `What is the connection string of the local Postgres instance you would like to use with the Data Connect emulator?`,
    default: defaultConnectionString,
  });
  setup.rcfile.dataconnectEmulatorConfig = { postgres: { localConnectionString } };

  info.shouldProvisionCSQL = !!(
    setup.projectId &&
    (info.isNewInstance || info.isNewDatabase) &&
    (await confirm({
      message:
        "Would you like to provision your CloudSQL instance and database now? This will take a few minutes.",
      default: true,
    }))
  );
  return info;
}

// actuate writes product specific files and makes product specifc API calls.
// It does not handle writing firebase.json and .firebaserc
export async function actuate(setup: Setup, config: Config, info: RequiredInfo) {
  await writeFiles(config, info);

  if (setup.projectId && info.shouldProvisionCSQL) {
    await provisionCloudSql({
      projectId: setup.projectId,
      locationId: info.locationId,
      instanceId: info.cloudSqlInstanceId,
      databaseId: info.cloudSqlDatabase,
      enableGoogleMlIntegration: false,
      waitForCreation: false,
    });
  }
}

async function writeFiles(config: Config, info: RequiredInfo) {
  const dir: string = config.get("dataconnect.source") || "dataconnect";
  console.log(dir);
  const subbedDataconnectYaml = subDataconnectYamlValues({
    ...info,
    connectorDirs: info.connectors.map((c) => c.path),
  });

  config.set("dataconnect", { source: dir });
  await config.askWriteProjectFile(join(dir, "dataconnect.yaml"), subbedDataconnectYaml);

  if (info.schemaGql.length) {
    logSuccess(
      "The service you chose already has GQL files deployed. We'll use those instead of the default templates.",
    );
    for (const f of info.schemaGql) {
      await config.askWriteProjectFile(join(dir, "schema", f.path), f.content);
    }
  } else {
    await config.askWriteProjectFile(join(dir, "schema", "schema.gql"), SCHEMA_TEMPLATE);
  }
  for (const c of info.connectors) {
    await writeConnectorFiles(config, c);
  }
}

async function writeConnectorFiles(
  config: Config,
  connectorInfo: {
    id: string;
    path: string;
    files: File[];
  },
) {
  const subbedConnectorYaml = subConnectorYamlValues({ connectorId: connectorInfo.id });
  const dir: string = config.get("dataconnect.source") || "dataconnect";
  await config.askWriteProjectFile(
    join(dir, connectorInfo.path, "connector.yaml"),
    subbedConnectorYaml,
  );
  for (const f of connectorInfo.files) {
    await config.askWriteProjectFile(join(dir, connectorInfo.path, f.path), f.content);
  }
}

function subDataconnectYamlValues(replacementValues: {
  serviceId: string;
  cloudSqlInstanceId: string;
  cloudSqlDatabase: string;
  connectorDirs: string[];
  locationId: string;
}): string {
  const replacements: Record<string, string> = {
    serviceId: "__serviceId__",
    cloudSqlDatabase: "__cloudSqlDatabase__",
    cloudSqlInstanceId: "__cloudSqlInstanceId__",
    connectorDirs: "__connectorDirs__",
    locationId: "__location__",
  };
  let replaced = DATACONNECT_YAML_TEMPLATE;
  for (const [k, v] of Object.entries(replacementValues)) {
    replaced = replaced.replace(replacements[k], JSON.stringify(v));
  }
  return replaced;
}

function subConnectorYamlValues(replacementValues: { connectorId: string }): string {
  const replacements: Record<string, string> = {
    connectorId: "__connectorId__",
  };
  let replaced = CONNECTOR_YAML_TEMPLATE;
  for (const [k, v] of Object.entries(replacementValues)) {
    replaced = replaced.replace(replacements[k], JSON.stringify(v));
  }
  return replaced;
}

async function promptForService(setup: Setup, info: RequiredInfo): Promise<RequiredInfo> {
  if (setup.projectId) {
    await ensureApis(setup.projectId);
    // TODO (b/344021748): Support initing with services that have existing sources/files
    const existingServices = await listAllServices(setup.projectId);
    const existingServicesAndSchemas = await Promise.all(
      existingServices.map(async (s) => {
        return {
          service: s,
          schema: await getSchema(s.name),
        };
      }),
    );
    if (existingServicesAndSchemas.length) {
      const choices: { name: string; value: any }[] = existingServicesAndSchemas.map((s) => {
        const serviceName = parseServiceName(s.service.name);
        return {
          name: `${serviceName.location}/${serviceName.serviceId}`,
          value: s,
        };
      });
      choices.push({ name: "Create a new service", value: undefined });
      const choice: { service: Service; schema: Schema } = await promptOnce({
        message:
          "Your project already has existing services. Which would you like to set up local files for?",
        type: "list",
        choices,
      });
      if (choice) {
        const serviceName = parseServiceName(choice.service.name);
        info.serviceId = serviceName.serviceId;
        info.locationId = serviceName.location;
        if (choice.schema) {
          if (choice.schema.primaryDatasource.postgresql?.cloudSql.instance) {
            const instanceName = parseCloudSQLInstanceName(
              choice.schema.primaryDatasource.postgresql?.cloudSql.instance,
            );
            info.cloudSqlInstanceId = instanceName.instanceId;
          }
          if (choice.schema.source.files) {
            info.schemaGql = choice.schema.source.files;
          }
          info.cloudSqlDatabase = choice.schema.primaryDatasource.postgresql?.database ?? "";
          const connectors = await listConnectors(choice.service.name, [
            "connectors.name",
            "connectors.source.files",
          ]);
          if (connectors.length) {
            info.connectors = connectors.map((c) => {
              const id = c.name.split("/").pop()!;
              return {
                id,
                path: `./${id}`,
                files: c.source.files || [],
              };
            });
          }
        }
      }
    }
  }

  if (info.serviceId === "") {
    info.serviceId = await promptOnce({
      message: "What ID would you like to use for this service?",
      type: "input",
      default: "my-service",
    });
  }
  return info;
}

async function promptForCloudSQLInstance(setup: Setup, info: RequiredInfo): Promise<RequiredInfo> {
  if (setup.projectId) {
    const instances = await cloudsql.listInstances(setup.projectId);
    let choices = instances.map((i) => {
      return { name: i.name, value: i.name, location: i.region };
    });
    // If we've already chosen a region (ie service already exists), only list instances from that region.
    choices = choices.filter((c) => info.locationId === "" || info.locationId === c.location);
    if (choices.length) {
      const freeTrialInstanceId = await checkForFreeTrialInstance(setup.projectId);
      if (!freeTrialInstanceId) {
        choices.push({ name: "Create a new instance", value: "", location: "" });
      }
      info.cloudSqlInstanceId = await promptOnce({
        message: `Which CloudSQL instance would you like to use?`,
        type: "list",
        choices,
      });
      if (info.cloudSqlInstanceId !== "") {
        // Infer location if a CloudSQL instance is chosen.
        info.locationId = choices.find((c) => c.value === info.cloudSqlInstanceId)!.location;
      }
    }
  }
  if (info.cloudSqlInstanceId === "") {
    info.isNewInstance = true;
    info.cloudSqlInstanceId = await promptOnce({
      message: `What ID would you like to use for your new CloudSQL instance?`,
      type: "input",
      default: `fdc-sql`,
    });
  }
  if (info.locationId === "") {
    const choices = await locationChoices(setup);
    info.locationId = await promptOnce({
      message: "What location would like to use?",
      type: "list",
      choices,
    });
  }
  return info;
}

async function locationChoices(setup: Setup) {
  if (setup.projectId) {
    const locations = await listLocations(setup.projectId);
    return locations.map((l) => {
      return { name: l, value: l };
    });
  } else {
    // Hardcoded locations for when there is no project set up.
    return [
      { name: "us-central1", value: "us-central1" },
      { name: "europe-north1", value: "europe-north1" },
      { name: "europe-central2", value: "europe-central2" },
      { name: "europe-west1", value: "europe-west1" },
      { name: "southamerica-west1", value: "southamerica-west1" },
      { name: "us-east4", value: "us-east4" },
      { name: "us-west1", value: "us-west1" },
      { name: "asia-southeast1", value: "asia-southeast1" },
    ];
  }
}

async function promptForDatabase(
  setup: Setup,
  config: Config,
  info: RequiredInfo,
): Promise<RequiredInfo> {
  if (!info.isNewInstance && setup.projectId) {
    try {
      const dbs = await cloudsql.listDatabases(setup.projectId, info.cloudSqlInstanceId);
      const choices = dbs.map((d) => {
        return { name: d.name, value: d.name };
      });
      choices.push({ name: "Create a new database", value: "" });
      if (dbs.length) {
        info.cloudSqlDatabase = await promptOnce({
          message: `Which database in ${info.cloudSqlInstanceId} would you like to use?`,
          type: "list",
          choices,
        });
      }
    } catch (err) {
      // Show existing databases in a list is optional, ignore any errors from ListDatabases.
      // This often happen when the Cloud SQL instance is still being created.
      logger.debug(`[dataconnect] Cannot list databases during init: ${err}`);
    }
  }
  if (info.cloudSqlDatabase === "") {
    info.isNewDatabase = true;
    info.cloudSqlDatabase = await promptOnce({
      message: `What ID would you like to use for your new database in ${info.cloudSqlInstanceId}?`,
      type: "input",
      default: `fdcdb`,
    });
  }
  return info;
}
