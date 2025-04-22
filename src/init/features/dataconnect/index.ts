import { join, basename } from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";

import { confirm, promptOnce } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";
import { provisionCloudSql } from "../../../dataconnect/provisionCloudSql";
import { checkFreeTrialInstanceUsed, upgradeInstructions } from "../../../dataconnect/freeTrial";
import * as cloudsql from "../../../gcp/cloudsql/cloudsqladmin";
import { ensureApis, ensureSparkApis } from "../../../dataconnect/ensureApis";
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
import { logBullet, envOverride } from "../../../utils";
import { checkBillingEnabled } from "../../../gcp/cloudbilling";
import * as sdk from "./sdk";
import { getPlatformFromFolder } from "../../../dataconnect/fileUtils";

const DATACONNECT_YAML_TEMPLATE = readTemplateSync("init/dataconnect/dataconnect.yaml");
const CONNECTOR_YAML_TEMPLATE = readTemplateSync("init/dataconnect/connector.yaml");
const SCHEMA_TEMPLATE = readTemplateSync("init/dataconnect/schema.gql");
const QUERIES_TEMPLATE = readTemplateSync("init/dataconnect/queries.gql");
const MUTATIONS_TEMPLATE = readTemplateSync("init/dataconnect/mutations.gql");

// serviceEnvVar is used by Firebase Console to specify which service to import.
// It should be in the form <location>/<serviceId>
// It must be an existing service - if set to anything else, we'll ignore it.
const serviceEnvVar = () => envOverride("FDC_SERVICE", "");

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

const emptyConnector = {
  id: "default",
  path: "./connector",
  files: [],
};

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

const defaultSchema = { path: "schema.gql", content: SCHEMA_TEMPLATE };

// doSetup is split into 2 phases - ask questions and then actuate files and API calls based on those answers.
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const isBillingEnabled = setup.projectId ? await checkBillingEnabled(setup.projectId) : false;
  if (setup.projectId) {
    isBillingEnabled ? await ensureApis(setup.projectId) : await ensureSparkApis(setup.projectId);
  }
  const info = await askQuestions(setup, isBillingEnabled);
  // Most users will want to perist data between emulator runs, so set this to a reasonable default.

  const dir: string = config.get("dataconnect.source", "dataconnect");
  const dataDir = config.get("emulators.dataconnect.dataDir", `${dir}/.dataconnect/pgliteData`);
  config.set("emulators.dataconnect.dataDir", dataDir);
  await actuate(setup, config, info);

  const cwdPlatformGuess = await getPlatformFromFolder(process.cwd());
  if (cwdPlatformGuess !== Platform.NONE) {
    await sdk.doSetup(setup, config);
  } else {
    logBullet(
      `If you'd like to add the generated SDK to your app later, run ${clc.bold("firebase init dataconnect:sdk")}`,
    );
  }
  if (setup.projectId && !isBillingEnabled) {
    logBullet(upgradeInstructions(setup.projectId));
  }
}

// askQuestions prompts the user about the Data Connect service they want to init. Any prompting
// logic should live here, and _no_ actuation logic should live here.
async function askQuestions(setup: Setup, isBillingEnabled: boolean): Promise<RequiredInfo> {
  let info: RequiredInfo = {
    serviceId: "",
    locationId: "",
    cloudSqlInstanceId: "",
    isNewInstance: false,
    cloudSqlDatabase: "",
    isNewDatabase: false,
    connectors: [defaultConnector],
    schemaGql: [defaultSchema],
    shouldProvisionCSQL: false,
  };
  // Query backend and pick up any existing services quickly.
  info = await promptForExistingServices(setup, info, isBillingEnabled);

  const requiredConfigUnset =
    info.serviceId === "" ||
    info.cloudSqlInstanceId === "" ||
    info.locationId === "" ||
    info.cloudSqlDatabase === "";
  const shouldConfigureBackend =
    isBillingEnabled &&
    requiredConfigUnset &&
    (await confirm({
      message: `Would you like to configure your backend resources now?`,
      // For Blaze Projects, configure Cloud SQL by default.
      // TODO: For Spark projects, allow them to configure Cloud SQL but deploy as unlinked Postgres.
      default: true,
    }));
  if (shouldConfigureBackend) {
    info = await promptForService(info);
    info = await promptForCloudSQL(setup, info);

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
    // Ensure that the suggested name is DNS compatible
    const defaultServiceId = toDNSCompatibleId(basename(process.cwd()));
    info.serviceId = info.serviceId || defaultServiceId;
    info.cloudSqlInstanceId =
      info.cloudSqlInstanceId || `${info.serviceId.toLowerCase() || "app"}-fdc`;
    info.locationId = info.locationId || `us-central1`;
    info.cloudSqlDatabase = info.cloudSqlDatabase || `fdcdb`;
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
      location: info.locationId,
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
  // If we are starting from a fresh project without data connect,
  if (!config.get("dataconnect.source")) {
    // Make sure to add add some GQL files.
    // Use the template if the existing service is empty (no schema / connector GQL).
    if (!info.schemaGql.length && !info.connectors.flatMap((r) => r.files).length) {
      info.schemaGql = [defaultSchema];
      info.connectors = [defaultConnector];
    }
  }

  config.set("dataconnect", { source: dir });
  await config.askWriteProjectFile(
    join(dir, "dataconnect.yaml"),
    subbedDataconnectYaml,
    false,
    // Default to override dataconnect.yaml
    // Sole purpose of `firebase init dataconnect` is to update `dataconnect.yaml`.
    true,
  );

  if (info.schemaGql.length) {
    for (const f of info.schemaGql) {
      await config.askWriteProjectFile(join(dir, "schema", f.path), f.content);
    }
  } else {
    // Even if the schema is empty, lets give them an empty .gql file to get started.
    fs.ensureFileSync(join(dir, "schema", "schema.gql"));
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

async function promptForExistingServices(
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
    let choice: { service: Service; schema?: Schema } | undefined;
    const [serviceLocationFromEnvVar, serviceIdFromEnvVar] = serviceEnvVar().split("/");
    const serviceFromEnvVar = existingServicesAndSchemas.find((s) => {
      const serviceName = parseServiceName(s.service.name);
      return (
        serviceName.serviceId === serviceIdFromEnvVar &&
        serviceName.location === serviceLocationFromEnvVar
      );
    });
    if (serviceFromEnvVar) {
      choice = serviceFromEnvVar;
    } else {
      const choices: { name: string; value: { service: Service; schema?: Schema } | undefined }[] =
        existingServicesAndSchemas.map((s) => {
          const serviceName = parseServiceName(s.service.name);
          return {
            name: `${serviceName.location}/${serviceName.serviceId}`,
            value: s,
          };
        });
      choices.push({ name: "Create a new service", value: undefined });
      choice = await promptOnce({
        message:
          "Your project already has existing services. Which would you like to set up local files for?",
        type: "list",
        choices,
      });
    }
    if (choice) {
      const serviceName = parseServiceName(choice.service.name);
      info.serviceId = serviceName.serviceId;
      info.locationId = serviceName.location;
      // If the existing service has no schema, don't override any gql files.
      info.schemaGql = [];
      info.connectors = [emptyConnector];
      if (choice.schema) {
        const primaryDatasource = choice.schema.datasources.find((d) => d.postgresql);
        if (primaryDatasource?.postgresql?.cloudSql.instance) {
          const instanceName = parseCloudSQLInstanceName(
            primaryDatasource.postgresql.cloudSql.instance,
          );
          info.cloudSqlInstanceId = instanceName.instanceId;
        }
        if (choice.schema.source.files?.length) {
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
  return info;
}

async function promptForCloudSQL(setup: Setup, info: RequiredInfo): Promise<RequiredInfo> {
  // Check for existing Cloud SQL instances, if we didn't already set one.
  if (info.cloudSqlInstanceId === "" && setup.projectId) {
    const instances = await cloudsql.listInstances(setup.projectId);
    let choices = instances.map((i) => {
      let display = `${i.name} (${i.region})`;
      if (i.settings.userLabels?.["firebase-data-connect"] === "ft") {
        display += " (no cost trial)";
      }
      return { name: display, value: i.name, location: i.region };
    });
    // If we've already chosen a region (ie service already exists), only list instances from that region.
    choices = choices.filter((c) => info.locationId === "" || info.locationId === c.location);
    if (choices.length) {
      if (!(await checkFreeTrialInstanceUsed(setup.projectId))) {
        choices.push({ name: "Create a new free trial instance", value: "", location: "" });
      } else {
        choices.push({ name: "Create a new CloudSQL instance", value: "", location: "" });
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

  // No existing instance found or choose to create new instance.
  if (info.cloudSqlInstanceId === "") {
    info.isNewInstance = true;
    info.cloudSqlInstanceId = await promptOnce({
      message: `What ID would you like to use for your new CloudSQL instance?`,
      type: "input",
      default: `${info.serviceId.toLowerCase() || "app"}-fdc`,
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

  // Look for existing databases within the picked instance.
  // Best effort since the picked `info.cloudSqlInstanceId` may not exists or is still being provisioned.
  if (info.cloudSqlDatabase === "" && setup.projectId) {
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

  // No existing database found or cannot access the instance.
  // Prompt for a name.
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

/**
 * Converts any string to a DNS friendly service ID.
 */
export function toDNSCompatibleId(id: string): string {
  let defaultServiceId = basename(id)
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "")
    .slice(0, 63);
  while (defaultServiceId.endsWith("-") && defaultServiceId.length) {
    defaultServiceId = defaultServiceId.slice(0, defaultServiceId.length - 1);
  }
  while (defaultServiceId.startsWith("-") && defaultServiceId.length) {
    defaultServiceId = defaultServiceId.slice(1, defaultServiceId.length);
  }
  return defaultServiceId || "app";
}
