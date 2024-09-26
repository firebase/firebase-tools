import { join, basename } from "path";
import * as clc from "colorette";

import { confirm, promptOnce } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";
import { provisionCloudSql } from "../../../dataconnect/provisionCloudSql";
import { checkForFreeTrialInstance } from "../../../dataconnect/freeTrial";
import * as cloudsql from "../../../gcp/cloudsql/cloudsqladmin";
import { ensureApis, ensureSparkApis } from "../../../dataconnect/ensureApis";
import * as experiments from "../../../experiments";
import {
  listLocations,
  listAllServices,
  getSchema,
  listConnectors,
} from "../../../dataconnect/client";
import { Schema, Service, File, Platform } from "../../../dataconnect/types";
import { parseCloudSQLInstanceName, parseServiceName } from "../../../dataconnect/names";
import { logger } from "../../../logger";
import { readTemplateSync } from "../../../templates";
import { logBullet, logSuccess } from "../../../utils";
import { checkBillingEnabled } from "../../../gcp/cloudbilling";
import * as sdk from "./sdk";
import { getPlatformFromFolder } from "../../../dataconnect/fileUtils";

const DATACONNECT_YAML_TEMPLATE = readTemplateSync("init/dataconnect/dataconnect.yaml");
const DATACONNECT_YAML_COMPAT_EXPERIMENT_TEMPLATE = readTemplateSync(
  "init/dataconnect/dataconnect-fdccompatiblemode.yaml",
);
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
  const info = await askQuestions(setup);
  await actuate(setup, config, info);

  const cwdPlatformGuess = await getPlatformFromFolder(process.cwd());
  if (cwdPlatformGuess !== Platform.UNDETERMINED) {
    await sdk.doSetup(setup, config);
  } else {
    const promptForSDKGeneration = await confirm({
      message: `Would you like to configure generated SDKs now?`,
      default: false,
    });
    if (promptForSDKGeneration) {
      await sdk.doSetup(setup, config);
    } else {
      logBullet(
        `If you'd like to generate an SDK for your new connector later, run ${clc.bold("firebase init dataconnect:sdk")}`,
      );
    }
  }

  logger.info("");
}

// askQuestions prompts the user about the Data Connect service they want to init. Any prompting
// logic should live here, and _no_ actuation logic should live here.
async function askQuestions(setup: Setup): Promise<RequiredInfo> {
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
  const isBillingEnabled = setup.projectId ? await checkBillingEnabled(setup.projectId) : false;
  if (setup.projectId) {
    isBillingEnabled ? await ensureApis(setup.projectId) : await ensureSparkApis(setup.projectId);
  }

  info = await checkExistingInstances(setup, info, isBillingEnabled);

  const shouldConfigureBackend = isBillingEnabled
    ? await confirm({
        message: `Would you like to configure your backend resources now?`,
        default: false,
      })
    : false;

  if (shouldConfigureBackend) {
    info = await promptForService(info);
    info = await promptForCloudSQLInstance(setup, info);
    info = await promptForDatabase(info);

    info.shouldProvisionCSQL = !!(
      setup.projectId &&
      (info.isNewInstance || info.isNewDatabase) &&
      isBillingEnabled &&
      (await confirm({
        message: `Would you like to provision your Cloud SQL instance and database now?${info.isNewInstance ? " This will take several minutes." : ""}.`,
        default: true,
      }))
    );
  } else {
    info.serviceId = info.serviceId !== "" ? info.serviceId : basename(process.cwd());
    info.cloudSqlInstanceId =
      info.cloudSqlInstanceId !== "" ? info.cloudSqlInstanceId : `${info.serviceId || "app"}-fdc`;
    info.locationId = info.locationId !== "" ? info.locationId : `us-central1`;
    info.cloudSqlDatabase = info.cloudSqlDatabase !== "" ? info.cloudSqlDatabase : `fdcdb`;
    logBullet(
      `Setting placeholder values in dataconnect.yaml. You can edit these before you deploy to specify different IDs or regions.`,
    );
  }
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
  let replaced = experiments.isEnabled("fdccompatiblemode")
    ? DATACONNECT_YAML_COMPAT_EXPERIMENT_TEMPLATE
    : DATACONNECT_YAML_TEMPLATE;
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

async function checkExistingInstances(
  setup: Setup,
  info: RequiredInfo,
  isBillingEnabled: boolean,
): Promise<RequiredInfo> {
  if (!setup.projectId || !isBillingEnabled) {
    // TODO(b/368609569): Don't gate this behind billing once backend billing fix is rolled out.
    return info;
  }

  // Check for existing Firebase Data Connect services.
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
        const primaryDatasource = choice.schema.datasources.find((d) => d.postgresql);
        if (primaryDatasource?.postgresql?.cloudSql.instance) {
          const instanceName = parseCloudSQLInstanceName(
            primaryDatasource.postgresql.cloudSql.instance,
          );
          info.cloudSqlInstanceId = instanceName.instanceId;
        }
        if (choice.schema.source.files) {
          info.schemaGql = choice.schema.source.files;
        }
        info.cloudSqlDatabase = primaryDatasource?.postgresql?.database ?? "";
        const connectors = await listConnectors(choice.service.name, [
          "connectors.name",
          "connectors.source.files",
        ]);
        if (connectors.length) {
          info.connectors = connectors.map((c) => {
            const id = c.name.split("/").pop()!;
            return {
              id,
              path: connectors.length === 1 ? "./connector" : `./${id}`,
              files: c.source.files || [],
            };
          });
        }
      }
    }
  }

  // Check for existing Cloud SQL instances, if we didn't already set one.
  if (info.cloudSqlInstanceId === "") {
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

  // Check for existing Cloud SQL databases, if we didn't already set one.
  if (info.cloudSqlDatabase === "" && info.cloudSqlInstanceId !== "") {
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
  return info;
}

async function promptForService(info: RequiredInfo): Promise<RequiredInfo> {
  if (info.serviceId === "") {
    info.serviceId = await promptOnce({
      message: "What ID would you like to use for this service?",
      type: "input",
      default: basename(process.cwd()),
    });
  }
  return info;
}

async function promptForCloudSQLInstance(setup: Setup, info: RequiredInfo): Promise<RequiredInfo> {
  if (info.cloudSqlInstanceId === "") {
    info.isNewInstance = true;
    info.cloudSqlInstanceId = await promptOnce({
      message: `What ID would you like to use for your new CloudSQL instance?`,
      type: "input",
      default: `${info.serviceId || "app"}-fdc`,
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

async function promptForDatabase(info: RequiredInfo): Promise<RequiredInfo> {
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
