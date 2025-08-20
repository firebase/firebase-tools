import { join, basename } from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";

import { input, select } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";
import { provisionCloudSql } from "../../../dataconnect/provisionCloudSql";
import { checkFreeTrialInstanceUsed, upgradeInstructions } from "../../../dataconnect/freeTrial";
import * as cloudsql from "../../../gcp/cloudsql/cloudsqladmin";
import { ensureApis, ensureGIFApis } from "../../../dataconnect/ensureApis";
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
import {
  logBullet,
  logWarning,
  envOverride,
  promiseWithSpinner,
  logLabeledError,
} from "../../../utils";
import { isBillingEnabled } from "../../../gcp/cloudbilling";
import * as sdk from "./sdk";
import { getPlatformFromFolder } from "../../../dataconnect/fileUtils";
import {
  generateOperation,
  generateSchema,
  PROMPT_GENERATE_CONNECTOR,
  PROMPT_GENERATE_SEED_DATA,
} from "../../../gemini/fdcExperience";
import { configstore } from "../../../configstore";
import { Options } from "../../../options";

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
  // If present, this is downloaded from an existing deployed service.
  serviceGql?: ServiceGQL;
}

export interface ServiceGQL {
  schemaGql: File[];
  connectors: {
    id: string;
    path: string;
    files: File[];
  }[];
  seedDataGql?: string;
}

const emptyConnector = {
  id: "example",
  path: "./example",
  files: [],
};

const defaultConnector = {
  id: "example",
  path: "./example",
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
  const info: RequiredInfo = {
    appDescription: "",
    serviceId: "",
    locationId: "",
    cloudSqlInstanceId: "",
    cloudSqlDatabase: "",
  };
  if (setup.projectId) {
    const hasBilling = await isBillingEnabled(setup);
    await ensureApis(setup.projectId);
    await promptForExistingServices(setup, info);
    if (!info.serviceGql) {
      // TODO: Consider use Gemini to generate schema for Spark project as well.
      if (!configstore.get("gemini")) {
        logBullet(
          "Learn more about Gemini in Firebase and how it uses your data: https://firebase.google.com/docs/gemini-in-firebase#how-gemini-in-firebase-uses-your-data",
        );
      }
      info.appDescription = await input({
        message: `Describe your app to automatically generate a schema [Enter to skip]:`,
      });
      if (info.appDescription) {
        configstore.set("gemini", true);
        await ensureGIFApis(setup.projectId);
      }
    }
    if (hasBilling) {
      await promptForCloudSQL(setup, info);
    }
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
  info.serviceId = info.serviceId || defaultServiceId();
  info.cloudSqlInstanceId = info.cloudSqlInstanceId || `${info.serviceId.toLowerCase()}-fdc`;
  info.locationId = info.locationId || `us-central1`;
  info.cloudSqlDatabase = info.cloudSqlDatabase || `fdcdb`;

  const projectId = setup.projectId;
  if (!projectId) {
    // Use the static template if it starts from scratch.
    return await writeFiles(
      config,
      info,
      { schemaGql: [defaultSchema], connectors: [defaultConnector] },
      options,
    );
  }
  const hasBilling = await isBillingEnabled(setup);
  if (hasBilling) {
    // Kicks off Cloud SQL provisioning if the project has billing enabled.
    await provisionCloudSql({
      projectId: projectId,
      location: info.locationId,
      instanceId: info.cloudSqlInstanceId,
      databaseId: info.cloudSqlDatabase,
      enableGoogleMlIntegration: false,
      waitForCreation: false,
    });
  }
  if (!info.appDescription) {
    // Download an existing service to a local workspace.
    if (info.serviceGql) {
      return await writeFiles(config, info, info.serviceGql, options);
    }
    // Use the static template if it starts from scratch or the existing service has no GQL source.
    return await writeFiles(
      config,
      info,
      { schemaGql: [defaultSchema], connectors: [defaultConnector] },
      options,
    );
  }

  const serviceName = `projects/${projectId}/locations/${info.locationId}/services/${info.serviceId}`;
  const serviceAlreadyExists = !(await createService(projectId, info.locationId, info.serviceId));

  // Use Gemini to generate schema.
  const schemaGql = await promiseWithSpinner(
    () => generateSchema(info.appDescription, projectId),
    "Generating the Data Connect Schema...",
  );
  const schemaFiles = [{ path: "schema.gql", content: schemaGql }];

  if (serviceAlreadyExists) {
    // If the service already exists, fallback to save only the generated schema.
    // Later customer can run `firebase deploy` to override the existing service.
    //
    // `firebase init dataconnect` always picks a new service ID, so it should never hit this case.
    // However, `firebase_init` MCP tool may pass an existing service ID.
    logLabeledError(
      "dataconnect",
      `Data Connect Service ${serviceName} already exists. Skip saving them...`,
    );
    return await writeFiles(config, info, { schemaGql: schemaFiles, connectors: [] }, options);
  }

  // Create the initial Data Connect Service and Schema generated by Gemini.
  await promiseWithSpinner(async () => {
    const [saveSchemaGql, waitForCloudSQLProvision] = schemasDeploySequence(
      projectId,
      info,
      schemaFiles,
      hasBilling,
    );
    await upsertSchema(saveSchemaGql);
    if (waitForCloudSQLProvision) {
      // Kicks off the LRO in the background. It will take about 10min. Don't wait for it.
      void upsertSchema(waitForCloudSQLProvision);
    }
  }, "Saving the Data Connect Schema...");

  try {
    // Generate the example Data Connect Connector and seed_data.gql with Gemini.
    // Save them to local file, but don't deploy it because they may have errors.
    const [operationGql, seedDataGql] = await promiseWithSpinner(
      () =>
        Promise.all([
          generateOperation(PROMPT_GENERATE_CONNECTOR, serviceName, projectId),
          generateOperation(PROMPT_GENERATE_SEED_DATA, serviceName, projectId),
        ]),
      "Generating the Data Connect Operations...",
    );
    const connectors = [
      {
        id: "example",
        path: "./example",
        files: [
          {
            path: "queries",
            content: operationGql,
          },
        ],
      },
    ];
    await writeFiles(
      config,
      info,
      { schemaGql: schemaFiles, connectors: connectors, seedDataGql: seedDataGql },
      options,
    );
  } catch (err: any) {
    logLabeledError("dataconnect", `Operation Generation failed...`);
    // GiF generate operation API has stability concerns.
    // Fallback to save only the generated schema.
    await writeFiles(config, info, { schemaGql: schemaFiles, connectors: [] }, options);
    throw err;
  }
}

function schemasDeploySequence(
  projectId: string,
  info: RequiredInfo,
  schemaFiles: File[],
  linkToCloudSql: boolean,
): Schema[] {
  const serviceName = `projects/${projectId}/locations/${info.locationId}/services/${info.serviceId}`;
  if (!linkToCloudSql) {
    // No Cloud SQL is being provisioned, just deploy the schema sources as a unlinked schema.
    return [
      {
        name: `${serviceName}/schemas/${SCHEMA_ID}`,
        datasources: [{ postgresql: {} }],
        source: {
          files: schemaFiles,
        },
      },
    ];
  }
  // Cloud SQL is being provisioned at the same time.
  // Persist the Cloud SQL schema associated with this FDC service, then start a LRO (`MIGRATE_COMPATIBLE`)
  // wait for Cloud SQL provision to finish and setup its initial SQL schemas.
  return [
    {
      name: `${serviceName}/schemas/${SCHEMA_ID}`,
      datasources: [
        {
          postgresql: {
            database: info.cloudSqlDatabase,
            cloudSql: {
              instance: `projects/${projectId}/locations/${info.locationId}/instances/${info.cloudSqlInstanceId}`,
            },
            schemaValidation: "NONE",
          },
        },
      ],
      source: {
        files: schemaFiles,
      },
    },
    {
      name: `${serviceName}/schemas/${SCHEMA_ID}`,
      datasources: [
        {
          postgresql: {
            database: info.cloudSqlDatabase,
            cloudSql: {
              instance: `projects/${projectId}/locations/${info.locationId}/instances/${info.cloudSqlInstanceId}`,
            },
            schemaMigration: "MIGRATE_COMPATIBLE",
          },
        },
      ],
      source: {
        files: schemaFiles,
      },
    },
  ];
}

export async function postSetup(setup: Setup, config: Config, options: Options): Promise<void> {
  const info = setup.featureInfo?.dataconnect;
  if (!info) {
    throw new Error("Data Connect feature RequiredInfo is not provided");
  }

  const instructions: string[] = [];
  const cwdPlatformGuess = await getPlatformFromFolder(process.cwd());
  // If a platform can be detected or a connector is chosen via env var, always
  // setup SDK. FDC_CONNECTOR is used for scripts under https://firebase.tools/.
  if (cwdPlatformGuess !== Platform.NONE || envOverride("FDC_CONNECTOR", "")) {
    await sdk.doSetup(setup, config, options);
  } else {
    instructions.push(
      `To add the generated SDK to your app, run ${clc.bold("firebase init dataconnect:sdk")}`,
    );
  }

  if (info.appDescription) {
    instructions.push(
      `You can visualize the Data Connect Schema in Firebase Console:

    https://console.firebase.google.com/project/${setup.projectId!}/dataconnect/locations/${info.locationId}/services/${info.serviceId}/schema`,
    );
  }

  if (setup.projectId && !setup.isBillingEnabled) {
    instructions.push(upgradeInstructions(setup.projectId));
  }

  logger.info(`\n${clc.bold("To get started with Firebase Data Connect:")}`);
  for (const i of instructions) {
    logBullet(i + "\n");
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
  if (serviceGql.seedDataGql) {
    await config.askWriteProjectFile(
      join(dir, "seed_data.gql"),
      serviceGql.seedDataGql,
      !!options.force,
    );
  }

  if (serviceGql.schemaGql.length) {
    for (const f of serviceGql.schemaGql) {
      await config.askWriteProjectFile(join(dir, "schema", f.path), f.content, !!options.force);
    }
  } else {
    // Even if the schema is empty, lets give them an empty .gql file to get started.
    fs.ensureFileSync(join(dir, "schema", "schema.gql"));
  }

  for (const c of serviceGql.connectors) {
    await writeConnectorFiles(config, c, options);
  }
}

async function writeConnectorFiles(
  config: Config,
  connectorInfo: {
    id: string;
    path: string;
    files: File[];
  },
  options: any,
) {
  const subbedConnectorYaml = subConnectorYamlValues({ connectorId: connectorInfo.id });
  const dir: string = config.get("dataconnect.source") || "dataconnect";
  await config.askWriteProjectFile(
    join(dir, connectorInfo.path, "connector.yaml"),
    subbedConnectorYaml,
    !!options.force,
  );
  for (const f of connectorInfo.files) {
    await config.askWriteProjectFile(
      join(dir, connectorInfo.path, f.path),
      f.content,
      !!options.force,
    );
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

async function promptForExistingServices(setup: Setup, info: RequiredInfo): Promise<void> {
  // Check for existing Firebase Data Connect services.
  if (!setup.projectId) {
    return;
  }
  const existingServices = await listAllServices(setup.projectId);
  if (!existingServices.length) {
    return;
  }
  const existingServicesAndSchemas = await Promise.all(
    existingServices.map(async (s) => {
      return { service: s, schema: await getSchema(s.name) };
    }),
  );
  const choice = await chooseExistingService(existingServicesAndSchemas);
  if (!choice) {
    const existingServiceIds = existingServices.map((s) => s.name.split("/").pop()!);
    info.serviceId = newUniqueId(defaultServiceId(), existingServiceIds);
    return;
  }
  // Choose to use an existing service.
  const serviceName = parseServiceName(choice.service.name);
  info.serviceId = serviceName.serviceId;
  info.locationId = serviceName.location;
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
  return;
}

interface serviceAndSchema {
  service: Service;
  schema?: Schema;
}

/**
 * Picks create new service or an existing service from the list of services.
 *
 * Firebase Console can provide `FDC_CONNECTOR` or `FDC_SERVICE` environment variable.
 * If either is present, chooseExistingService try to match it with any existing service
 * and short-circuit the prompt.
 *
 * `FDC_SERVICE` should have the format `<location>/<serviceId>`.
 * `FDC_CONNECTOR` should have the same `<location>/<serviceId>/<connectorId>`.
 * @param existing
 */
async function chooseExistingService(
  existing: serviceAndSchema[],
): Promise<serviceAndSchema | undefined> {
  const fdcConnector = envOverride("FDC_CONNECTOR", "");
  const fdcService = envOverride("FDC_SERVICE", "");
  const serviceEnvVar = fdcConnector || fdcService;
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
    const envVarName = fdcConnector ? "FDC_CONNECTOR" : "FDC_SERVICE";
    logWarning(`Unable to pick up an existing service based on ${envVarName}=${serviceEnvVar}.`);
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

async function promptForCloudSQL(setup: Setup, info: RequiredInfo): Promise<void> {
  if (!setup.projectId) {
    return;
  }
  // Check for existing Cloud SQL instances, if we didn't already set one.
  if (info.cloudSqlInstanceId === "") {
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
      } else {
        info.cloudSqlInstanceId = await input({
          message: `What ID would you like to use for your new CloudSQL instance?`,
          default: newUniqueId(
            `${defaultServiceId().toLowerCase()}-fdc`,
            instances.map((i) => i.name),
          ),
        });
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

  // The Gemini generated schema will override any SQL schema in this Postgres database.
  // To avoid accidental data loss, we pick a new database ID if `listDatabases` is available.
  if (info.cloudSqlInstanceId !== "" && info.cloudSqlDatabase === "") {
    try {
      const dbs = await cloudsql.listDatabases(setup.projectId, info.cloudSqlInstanceId);
      const existing = dbs.map((d) => d.name);
      info.cloudSqlDatabase = newUniqueId("fdcdb", existing);
    } catch (err) {
      // Show existing databases in a list is optional, ignore any errors from ListDatabases.
      // This often happen when the Cloud SQL instance is still being created.
      logger.debug(`[dataconnect] Cannot list databases during init: ${err}`);
    }
  }
  return;
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
 * Returns a unique ID that's either `recommended` or `recommended-{i}`.
 * Avoid existing IDs.
 */
function newUniqueId(recommended: string, existingIDs: string[]): string {
  let id = recommended;
  let i = 1;
  while (existingIDs.includes(id)) {
    id = `${recommended}-${i}`;
    i++;
  }
  return id;
}

function defaultServiceId(): string {
  return toDNSCompatibleId(basename(process.cwd()));
}

/**
 * Converts any string to a DNS friendly service ID.
 */
export function toDNSCompatibleId(id: string): string {
  id = basename(id)
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "")
    .slice(0, 63);
  while (id.endsWith("-") && id.length) {
    id = id.slice(0, id.length - 1);
  }
  while (id.startsWith("-") && id.length) {
    id = id.slice(1, id.length);
  }
  return id || "app";
}
