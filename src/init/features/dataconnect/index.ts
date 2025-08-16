import { join, basename } from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";

import { input, select } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";
import { provisionCloudSql } from "../../../dataconnect/provisionCloudSql";
import { checkFreeTrialInstanceUsed, upgradeInstructions } from "../../../dataconnect/freeTrial";
import * as cloudsql from "../../../gcp/cloudsql/cloudsqladmin";
import { ensureApis, ensureGIFApis, isApiEnabled } from "../../../dataconnect/ensureApis";
import {
  listLocations,
  listAllServices,
  getSchema,
  listConnectors,
  createService,
  upsertSchema,
} from "../../../dataconnect/client";
import { Schema, Service, File, Platform, SCHEMA_ID } from "../../../dataconnect/types";
import { parseCloudSQLInstanceName, parseServiceName } from "../../../dataconnect/names";
import { logger } from "../../../logger";
import { readTemplateSync } from "../../../templates";
import { logBullet, logWarning, envOverride, promiseWithSpinner } from "../../../utils";
import { isBillingEnabled } from "../../../gcp/cloudbilling";
import * as sdk from "./sdk";
import { getPlatformFromFolder } from "../../../dataconnect/fileUtils";
import {
  extractCodeBlock,
  generateOperation,
  generateSchema,
  PROMPT_GENERATE_CONNECTOR,
} from "../../../gemini/fdcExperience";
import { configstore } from "../../../configstore";

const DATACONNECT_YAML_TEMPLATE = readTemplateSync("init/dataconnect/dataconnect.yaml");
const CONNECTOR_YAML_TEMPLATE = readTemplateSync("init/dataconnect/connector.yaml");
const SCHEMA_TEMPLATE = readTemplateSync("init/dataconnect/schema.gql");
const QUERIES_TEMPLATE = readTemplateSync("init/dataconnect/queries.gql");
const MUTATIONS_TEMPLATE = readTemplateSync("init/dataconnect/mutations.gql");

export interface RequiredInfo {
  appDescription: string;
  serviceId: string;
  locationId: string;
  cloudSqlInstanceId: string;
  cloudSqlDatabase: string;
  // If present, initialize the workspace with sources of the existing service.
  serviceGql?: ServiceGQL;
}

export interface ServiceGQL {
  schemaGql: File[];
  connectors: {
    id: string;
    path: string;
    files: File[];
  }[];
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

// askQuestions prompts the user about the Data Connect service they want to init. Any prompting
// logic should live here, and _no_ actuation logic should live here.
export async function askQuestions(setup: Setup): Promise<void> {
  let info: RequiredInfo = {
    appDescription: "",
    serviceId: "",
    locationId: "",
    cloudSqlInstanceId: "",
    cloudSqlDatabase: "",
  };
  const hasBilling = await isBillingEnabled(setup);
  if (setup.projectId) {
    if (hasBilling || (await isApiEnabled(setup.projectId))) {
      await ensureApis(setup.projectId);
      // Query backend and pick up any existing services quickly.
      info = await promptForExistingServices(setup, info);
    } else {
      // New Spark project. Don't wait for API enablement.
      // Write the template and show them instructions right away.
      void ensureApis(setup.projectId);
    }
  }

  info = await promptForSchema(setup, info);
  if (hasBilling) {
    info = await promptForCloudSQL(setup, info);
  }
  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.dataconnect = info;
}

// actuate writes product specific files and makes product specifc API calls.
// It does not handle writing firebase.json and .firebaserc
export async function actuate(setup: Setup, config: Config, options: any): Promise<void> {
  // Most users will want to persist data between emulator runs, so set this to a reasonable default.
  const dir: string = config.get("dataconnect.source", "dataconnect");
  const dataDir = config.get("emulators.dataconnect.dataDir", `${dir}/.dataconnect/pgliteData`);
  config.set("emulators.dataconnect.dataDir", dataDir);

  const info = setup.featureInfo?.dataconnect;
  if (!info) {
    throw new Error("Data Connect feature RequiredInfo is not provided");
  }

  // Populate the default values of required fields.
  info.serviceId = info.serviceId || toDNSCompatibleId(basename(process.cwd()));
  info.cloudSqlInstanceId = info.cloudSqlInstanceId || `${info.serviceId.toLowerCase()}-fdc`;
  info.locationId = info.locationId || `us-central1`;
  info.cloudSqlDatabase = info.cloudSqlDatabase || `fdcdb`;

  if (!info.appDescription || !setup.projectId) {
    // Download an existing service to a local workspace.
    if (info.serviceGql) {
      return await writeFiles(config, info, info.serviceGql, options);
    }
    // Use the template if it starts from scratch or the existing service has no GQL source.
    return await writeFiles(
      config,
      info,
      { schemaGql: [defaultSchema], connectors: [defaultConnector] },
      options,
    );
  }

  configstore.set("gemini", true);
  await ensureGIFApis(setup.projectId);
  const schemaGql = await promiseWithSpinner(
    () => generateSchema(info.appDescription, setup.projectId!),
    "Generating the Data Connect Schema...",
  );
  const schemaFiles = [{ path: "schema.gql", content: extractCodeBlock(schemaGql) }];
  await createService(setup.projectId, info.locationId, info.serviceId);
  const serviceName = `projects/${setup.projectId}/locations/${info.locationId}/services/${info.serviceId}`;
  const schema = {
    name: `${serviceName}/schemas/${SCHEMA_ID}`,
    datasources: [
      {
        postgresql: {},
      },
    ],
    source: {
      files: schemaFiles,
    },
  };
  await upsertSchema(schema);
  const operationGql = await promiseWithSpinner(
    () => generateOperation(PROMPT_GENERATE_CONNECTOR, serviceName, setup.projectId!),
    "Generating the Data Connect Schema...",
  );
  const connectors = [
    {
      id: "default",
      path: "./connector",
      files: [
        {
          path: "default.gql",
          content: operationGql,
        },
      ],
    },
  ];

  await provisionCloudSql({
    projectId: setup.projectId,
    location: info.locationId,
    instanceId: info.cloudSqlInstanceId,
    databaseId: info.cloudSqlDatabase,
    enableGoogleMlIntegration: false,
    waitForCreation: false,
  });
}

export async function postSetup(setup: Setup, config: Config): Promise<void> {
  const cwdPlatformGuess = await getPlatformFromFolder(process.cwd());
  // If a platform can be detected or a connector is chosen via env var, always
  // setup SDK. FDC_CONNECTOR is used for scripts under https://firebase.tools/.
  if (cwdPlatformGuess !== Platform.NONE || envOverride("FDC_CONNECTOR", "")) {
    await sdk.doSetup(setup, config);
  } else {
    logBullet(
      `If you'd like to add the generated SDK to your app later, run ${clc.bold("firebase init dataconnect:sdk")}`,
    );
  }
  if (setup.projectId && !setup.isBillingEnabled) {
    logBullet(upgradeInstructions(setup.projectId));
  }
}

async function writeFiles(
  config: Config,
  info: RequiredInfo,
  serviceGql: ServiceGQL,
  options: any,
): Promise<void> {
  const dir: string = config.get("dataconnect.source") || "dataconnect";
  const subbedDataconnectYaml = subDataconnectYamlValues({
    ...info,
    connectorDirs: serviceGql.connectors.map((c) => c.path),
  });
  config.set("dataconnect", { source: dir });
  await config.askWriteProjectFile(
    join(dir, "dataconnect.yaml"),
    subbedDataconnectYaml,
    !!options.force,
    // Default to override dataconnect.yaml
    // Sole purpose of `firebase init dataconnect` is to update `dataconnect.yaml`.
    true,
  );

  if (serviceGql.schemaGql.length) {
    for (const f of serviceGql.schemaGql) {
      await config.askWriteProjectFile(join(dir, "schema", f.path), f.content, !!options.force);
    }
  } else {
    // Even if the schema is empty, lets give them an empty .gql file to get started.
    fs.ensureFileSync(join(dir, "schema", "schema.gql"));
  }

  for (const c of serviceGql.connectors) {
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

async function promptForExistingServices(setup: Setup, info: RequiredInfo): Promise<RequiredInfo> {
  // Check for existing Firebase Data Connect services.
  if (!setup.projectId) {
    return info;
  }
  const serviceGqls = await listAllServices(setup.projectId);
  const serviceGqlsAndSchemas = await Promise.all(
    serviceGqls.map(async (s) => {
      return { service: s, schema: await getSchema(s.name) };
    }),
  );
  if (serviceGqlsAndSchemas.length) {
    const choice = await chooseserviceGql(serviceGqlsAndSchemas);
    if (choice) {
      const serviceName = parseServiceName(choice.service.name);
      info.serviceId = serviceName.serviceId;
      info.locationId = serviceName.location;
      // If the existing service has no schema, don't override any gql files.
      info.serviceGql = {
        schemaGql: [],
        connectors: [emptyConnector],
      };
      if (choice.schema) {
        const primaryDatasource = choice.schema.datasources.find((d) => d.postgresql);
        if (primaryDatasource?.postgresql?.cloudSql?.instance) {
          const instanceName = parseCloudSQLInstanceName(
            primaryDatasource.postgresql.cloudSql.instance,
          );
          info.cloudSqlInstanceId = instanceName.instanceId;
        }
        if (choice.schema.source.files?.length) {
          info.serviceGql.schemaGql = choice.schema.source.files;
        }
        info.cloudSqlDatabase = primaryDatasource?.postgresql?.database ?? "";
        const connectors = await listConnectors(choice.service.name, [
          "connectors.name",
          "connectors.source.files",
        ]);
        if (connectors.length) {
          info.serviceGql.connectors = connectors.map((c) => {
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

interface serviceAndSchema {
  service: Service;
  schema?: Schema;
}

/**
 * Picks create new service or an existing service from the list of services.
 *
 * Firebase Console can provide `FDC_CONNECTOR` or `FDC_SERVICE` environment variable.
 * If either is present, chooseserviceGql try to match it with any existing service
 * and short-circuit the prompt.
 *
 * `FDC_SERVICE` should have the format `<location>/<serviceId>`.
 * `FDC_CONNECTOR` should have the same `<location>/<serviceId>/<connectorId>`.
 * @param existing
 */
async function chooseserviceGql(
  existing: serviceAndSchema[],
): Promise<serviceAndSchema | undefined> {
  const serviceEnvVar = envOverride("FDC_CONNECTOR", "") || envOverride("FDC_SERVICE", "");
  if (serviceEnvVar) {
    const [serviceLocationFromEnvVar, serviceIdFromEnvVar] = serviceEnvVar.split("/");
    const serviceFromEnvVar = existing.find((s) => {
      const serviceName = parseServiceName(s.service.name);
      return (
        serviceName.serviceId === serviceIdFromEnvVar &&
        serviceName.location === serviceLocationFromEnvVar
      );
    });
    if (serviceFromEnvVar) {
      logBullet(
        `Picking up the existing service ${clc.bold(serviceLocationFromEnvVar + "/" + serviceIdFromEnvVar)}.`,
      );
      return serviceFromEnvVar;
    }
    logWarning(`Unable to pick up an existing service based on FDC_SERVICE=${serviceEnvVar}.`);
  }
  const choices: Array<{ name: string; value: serviceAndSchema | undefined }> = existing.map(
    (s) => {
      const serviceName = parseServiceName(s.service.name);
      return {
        name: `${serviceName.location}/${serviceName.serviceId}`,
        value: s,
      };
    },
  );
  choices.push({ name: "Create a new service", value: undefined });
  return await select<serviceAndSchema | undefined>({
    message:
      "Your project already has existing services. Which would you like to set up local files for?",
    choices,
  });
}

async function promptForCloudSQL(setup: Setup, info: RequiredInfo): Promise<RequiredInfo> {
  // Check for existing Cloud SQL instances if it's not configured already.
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
      info.cloudSqlInstanceId = await select<string>({
        message: `Which CloudSQL instance would you like to use?`,
        choices,
      });
      if (info.cloudSqlInstanceId !== "") {
        // Infer location if a CloudSQL instance is chosen.
        info.locationId = choices.find((c) => c.value === info.cloudSqlInstanceId)!.location;
      }
    }
  }

  if (info.locationId === "") {
    const choices = await locationChoices(setup);
    info.locationId = await select<string>({
      message: "What location would like to use?",
      choices,
      default: "us-central1",
    });
  }

  // Look for existing databases within the picked instance.
  // Best effort since the picked `info.cloudSqlInstanceId` may not exists or is still being provisioned.
  if (info.cloudSqlInstanceId !== "" && info.cloudSqlDatabase === "" && setup.projectId) {
    try {
      const dbs = await cloudsql.listDatabases(setup.projectId, info.cloudSqlInstanceId);
      const choices = dbs.map((d) => {
        return { name: d.name, value: d.name };
      });
      choices.push({ name: "Create a new database", value: "" });
      if (dbs.length) {
        info.cloudSqlDatabase = await select<string>({
          message: `Which database in ${info.cloudSqlInstanceId} would you like to use?`,
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

async function promptForSchema(setup: Setup, info: RequiredInfo): Promise<RequiredInfo> {
  if (info.serviceId === "") {
    info.serviceId = basename(process.cwd());
    if (setup.projectId) {
      if (!configstore.get("gemini")) {
        logBullet(
          "Learn more about Gemini in Firebase and how it uses your data: https://firebase.google.com/docs/gemini-in-firebase#how-gemini-in-firebase-uses-your-data",
        );
      }
      info.appDescription = await input({
        message: `Describe your app to automatically generate a schema [Enter to skip]:`,
      });
    }
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
