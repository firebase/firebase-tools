import { join, basename } from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";

import { input, select, confirm } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";
import { setupCloudSql } from "../../../dataconnect/provisionCloudSql";
import { checkFreeTrialInstanceUsed, upgradeInstructions } from "../../../dataconnect/freeTrial";
import * as cloudsql from "../../../gcp/cloudsql/cloudsqladmin";
import { ensureApis, ensureGIFApiTos } from "../../../dataconnect/ensureApis";
import * as experiments from "../../../experiments";
import {
  listLocations,
  listAllServices,
  getSchema,
  listConnectors,
  createService,
  upsertSchema,
} from "../../../dataconnect/client";
import { Schema, Service, File, MAIN_SCHEMA_ID } from "../../../dataconnect/types";
import { parseCloudSQLInstanceName, parseServiceName } from "../../../dataconnect/names";
import { logger } from "../../../logger";
import { readTemplateSync } from "../../../templates";
import {
  logBullet,
  logWarning,
  envOverride,
  promiseWithSpinner,
  logLabeledError,
  newUniqueId,
} from "../../../utils";
import { isBillingEnabled } from "../../../gcp/cloudbilling";
import * as sdk from "./sdk";
import {
  generateOperation,
  generateSchema,
  PROMPT_GENERATE_CONNECTOR,
  PROMPT_GENERATE_SEED_DATA,
} from "../../../gemini/fdcExperience";
import { configstore } from "../../../configstore";
import { trackGA4 } from "../../../track";

// Default GCP region for Data Connect
export const FDC_DEFAULT_REGION = "us-east4";

const DATACONNECT_YAML_TEMPLATE = readTemplateSync("init/dataconnect/dataconnect.yaml");
const DATACONNECT_YAML_WEBHOOKS_EXPERIMENT_TEMPLATE = readTemplateSync(
  "init/dataconnect/dataconnect-fdcwebhooks.yaml",
);
const CONNECTOR_YAML_TEMPLATE = readTemplateSync("init/dataconnect/connector.yaml");
const SCHEMA_TEMPLATE = readTemplateSync("init/dataconnect/schema.gql");
const QUERIES_TEMPLATE = readTemplateSync("init/dataconnect/queries.gql");
const MUTATIONS_TEMPLATE = readTemplateSync("init/dataconnect/mutations.gql");
const SEED_DATA_TEMPLATE = readTemplateSync("init/dataconnect/seed_data.gql");

export type Source =
  | "mcp_init"
  | "init"
  | "init_sdk"
  | "gen_sdk_init"
  | "gen_sdk_init_sdk"
  | "deploy";

export interface RequiredInfo {
  // The GA analytics metric to track how developers go through `init dataconnect`.
  flow: string;
  appDescription: string;
  serviceId: string;
  locationId: string;
  cloudSqlInstanceId: string;
  cloudSqlDatabase: string;
  // If true, we should provision a new Cloud SQL instance.
  shouldProvisionCSQL: boolean;
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

const templateServiceInfo: ServiceGQL = {
  schemaGql: [{ path: "schema.gql", content: SCHEMA_TEMPLATE }],
  connectors: [
    {
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
    },
  ],
  seedDataGql: SEED_DATA_TEMPLATE,
};

// askQuestions prompts the user about the Data Connect service they want to init. Any prompting
// logic should live here, and _no_ actuation logic should live here.
export async function askQuestions(setup: Setup): Promise<void> {
  const info: RequiredInfo = {
    flow: "",
    appDescription: "",
    serviceId: "",
    locationId: "",
    cloudSqlInstanceId: "",
    cloudSqlDatabase: "",
    shouldProvisionCSQL: false,
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
      const wantToGenerate = await confirm({
        message: "Do you want to generate schema and queries with Gemini?",
        default: false,
      });
      if (wantToGenerate) {
        configstore.set("gemini", true);
        await ensureGIFApiTos(setup.projectId);
        info.appDescription = await input({
          message: `Describe your app idea:`,
          validate: async (s: string) => {
            if (s.length > 0) {
              return true;
            }
            return "Please enter a description for your app idea.";
          },
        });
      }
    }
    if (hasBilling) {
      await promptForCloudSQL(setup, info);
    } else if (info.appDescription) {
      await promptForLocation(setup, info);
    }
  }
  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.dataconnect = info;

  await sdk.askQuestions(setup);
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
  info.locationId = info.locationId || FDC_DEFAULT_REGION;
  info.cloudSqlDatabase = info.cloudSqlDatabase || `fdcdb`;

  const startTime = Date.now();
  try {
    await actuateWithInfo(setup, config, info, options);
    await sdk.actuate(setup, config);
  } finally {
    const sdkInfo = setup.featureInfo?.dataconnectSdk;
    const source: Source = setup.featureInfo?.dataconnectSource || "init";
    void trackGA4(
      "dataconnect_init",
      {
        source,
        flow: info.flow.substring(1), // Trim the leading `_`
        project_status: setup.projectId
          ? (await isBillingEnabled(setup))
            ? info.shouldProvisionCSQL
              ? "blaze_provisioned_csql"
              : "blaze"
            : "spark"
          : "missing",
        ...(sdkInfo ? sdk.initAppCounters(sdkInfo) : {}),
      },
      Date.now() - startTime,
    );
  }

  if (info.appDescription) {
    setup.instructions.push(
      `You can visualize the Data Connect Schema in Firebase Console:

    https://console.firebase.google.com/project/${setup.projectId!}/dataconnect/locations/${info.locationId}/services/${info.serviceId}/schema`,
    );
  }
  if (!(await isBillingEnabled(setup))) {
    setup.instructions.push(upgradeInstructions(setup.projectId || "your-firebase-project"));
  }
  setup.instructions.push(
    `Install the Data Connect VS Code Extensions. You can explore Data Connect Query on local pgLite and Cloud SQL Postgres Instance.`,
  );
}

async function actuateWithInfo(
  setup: Setup,
  config: Config,
  info: RequiredInfo,
  options: any,
): Promise<void> {
  const projectId = setup.projectId;
  if (!projectId) {
    // If no project is present, just save the template files.
    info.flow += "_save_template";
    return await writeFiles(config, info, templateServiceInfo, options);
  }

  await ensureApis(projectId, /* silent =*/ true);
  const provisionCSQL = info.shouldProvisionCSQL && (await isBillingEnabled(setup));
  if (provisionCSQL) {
    // Kicks off Cloud SQL provisioning if the project has billing enabled.
    await setupCloudSql({
      projectId: projectId,
      location: info.locationId,
      instanceId: info.cloudSqlInstanceId,
      databaseId: info.cloudSqlDatabase,
      requireGoogleMlIntegration: false,
      source: setup.featureInfo?.dataconnectSource || "init",
    });
  }

  const serviceName = `projects/${projectId}/locations/${info.locationId}/services/${info.serviceId}`;
  if (!info.appDescription) {
    if (!info.serviceGql) {
      // Try download the existing service if it exists.
      // MCP tool `firebase_init` may setup an existing service.
      await downloadService(info, serviceName);
    }
    if (info.serviceGql) {
      // Save the downloaded service from the backend.
      info.flow += "_save_downloaded";
      return await writeFiles(config, info, info.serviceGql, options);
    }
    // Use the static template if it starts from scratch or the existing service has no GQL source.
    info.flow += "_save_template";
    return await writeFiles(config, info, templateServiceInfo, options);
  }
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
    // - CLI cmd `firebase init dataconnect` always picks a new service ID, so it should never hit this case.
    // - MCP tool `firebase_init` may pick an existing service ID, but shouldn't set app_description at the same time.
    logLabeledError(
      "dataconnect",
      `Data Connect Service ${serviceName} already exists. Skip saving them...`,
    );
    info.flow += "_save_gemini_service_already_exists";
    return await writeFiles(config, info, { schemaGql: schemaFiles, connectors: [] }, options);
  }

  // Create the initial Data Connect Service and Schema generated by Gemini.
  await promiseWithSpinner(async () => {
    const [saveSchemaGql, waitForCloudSQLProvision] = schemasDeploySequence(
      projectId,
      info,
      schemaFiles,
      provisionCSQL,
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
            path: "queries.gql",
            content: operationGql,
          },
        ],
      },
    ];
    info.flow += "_save_gemini";
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
    info.flow += "_save_gemini_operation_error";
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
        name: `${serviceName}/schemas/${MAIN_SCHEMA_ID}`,
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
      name: `${serviceName}/schemas/${MAIN_SCHEMA_ID}`,
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
      name: `${serviceName}/schemas/${MAIN_SCHEMA_ID}`,
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
    // Default to override connector.yaml
    true,
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
    locationId: "__location__",
    cloudSqlDatabase: "__cloudSqlDatabase__",
    cloudSqlInstanceId: "__cloudSqlInstanceId__",
    connectorDirs: "__connectorDirs__",
  };
  let replaced = experiments.isEnabled("fdcwebhooks")
    ? DATACONNECT_YAML_WEBHOOKS_EXPERIMENT_TEMPLATE
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

async function promptForExistingServices(setup: Setup, info: RequiredInfo): Promise<void> {
  // Check for existing Firebase Data Connect services.
  if (!setup.projectId) {
    return;
  }
  const existingServices = await listAllServices(setup.projectId);
  if (!existingServices.length) {
    return;
  }
  const choice = await chooseExistingService(existingServices);
  if (!choice) {
    const existingServiceIds = existingServices.map((s) => s.name.split("/").pop()!);
    info.serviceId = newUniqueId(defaultServiceId(), existingServiceIds);
    info.flow += "_pick_new_service";
    return;
  }
  // Choose to use an existing service.
  info.flow += "_pick_existing_service";
  const serviceName = parseServiceName(choice.name);
  info.serviceId = serviceName.serviceId;
  info.locationId = serviceName.location;
  await downloadService(info, choice.name);
}

async function downloadService(info: RequiredInfo, serviceName: string): Promise<void> {
  const schema = await getSchema(serviceName);
  if (!schema) {
    return;
  }
  info.serviceGql = {
    schemaGql: [],
    connectors: [
      {
        id: "example",
        path: "./example",
        files: [],
      },
    ],
  };
  const primaryDatasource = schema.datasources.find((d) => d.postgresql);
  if (primaryDatasource?.postgresql?.cloudSql?.instance) {
    const instanceName = parseCloudSQLInstanceName(primaryDatasource.postgresql.cloudSql.instance);
    info.cloudSqlInstanceId = instanceName.instanceId;
  }
  if (schema.source.files?.length) {
    info.serviceGql.schemaGql = schema.source.files;
  }
  info.cloudSqlDatabase = primaryDatasource?.postgresql?.database ?? "";
  const connectors = await listConnectors(serviceName, [
    "connectors.name",
    "connectors.source.files",
  ]);
  if (connectors.length) {
    info.serviceGql.connectors = connectors.map((c) => {
      const id = c.name.split("/").pop()!;
      return {
        id,
        path: connectors.length === 1 ? "./example" : `./${id}`,
        files: c.source.files || [],
      };
    });
  }
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
async function chooseExistingService(existing: Service[]): Promise<Service | undefined> {
  const fdcConnector = envOverride("FDC_CONNECTOR", "");
  const fdcService = envOverride("FDC_SERVICE", "");
  const serviceEnvVar = fdcConnector || fdcService;
  if (serviceEnvVar) {
    const [serviceLocationFromEnvVar, serviceIdFromEnvVar] = serviceEnvVar.split("/");
    const serviceFromEnvVar = existing.find((s) => {
      const serviceName = parseServiceName(s.name);
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
  const choices: Array<{ name: string; value: Service | undefined }> = existing.map((s) => {
    const serviceName = parseServiceName(s.name);
    return {
      name: `${serviceName.location}/${serviceName.serviceId}`,
      value: s,
    };
  });
  choices.push({ name: "Create a new service", value: undefined });
  return await select<Service | undefined>({
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
        info.flow += "_pick_existing_csql";
        // Infer location if a CloudSQL instance is chosen.
        info.locationId = choices.find((c) => c.value === info.cloudSqlInstanceId)!.location;
      } else {
        info.flow += "_pick_new_csql";
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
    await promptForLocation(setup, info);
    info.shouldProvisionCSQL = await confirm({
      message: `Would you like to provision your Cloud SQL instance and database now?`,
      default: true,
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

async function promptForLocation(setup: Setup, info: RequiredInfo): Promise<void> {
  if (info.locationId === "") {
    const choices = await locationChoices(setup);
    info.locationId = await select<string>({
      message: "What location would you like to use?",
      choices,
      default: FDC_DEFAULT_REGION,
    });
  }
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
      { name: "asia-east1", value: "asia-east1" },
      { name: "asia-east2", value: "asia-east2" },
      { name: "asia-northeast1", value: "asia-northeast1" },
      { name: "asia-northeast2", value: "asia-northeast2" },
      { name: "asia-northeast3", value: "asia-northeast3" },
      { name: "asia-south1", value: "asia-south1" },
      { name: "asia-southeast1", value: "asia-southeast1" },
      { name: "asia-southeast2", value: "asia-southeast2" },
      { name: "australia-southeast1", value: "australia-southeast1" },
      { name: "australia-southeast2", value: "australia-southeast2" },
      { name: "europe-central2", value: "europe-central2" },
      { name: "europe-north1", value: "europe-north1" },
      { name: "europe-southwest1", value: "europe-southwest1" },
      { name: "europe-west1", value: "europe-west1" },
      { name: "europe-west2", value: "europe-west2" },
      { name: "europe-west3", value: "europe-west3" },
      { name: "europe-west4", value: "europe-west4" },
      { name: "europe-west6", value: "europe-west6" },
      { name: "europe-west8", value: "europe-west8" },
      { name: "europe-west9", value: "europe-west9" },
      { name: "me-west1", value: "me-west1" },
      { name: "northamerica-northeast1", value: "northamerica-northeast1" },
      { name: "northamerica-northeast2", value: "northamerica-northeast2" },
      { name: "southamerica-east1", value: "southamerica-east1" },
      { name: "southamerica-west1", value: "southamerica-west1" },
      { name: "us-central1", value: "us-central1" },
      { name: "us-east1", value: "us-east1" },
      { name: "us-east4", value: "us-east4" },
      { name: "us-south1", value: "us-south1" },
      { name: "us-west1", value: "us-west1" },
      { name: "us-west2", value: "us-west2" },
      { name: "us-west3", value: "us-west3" },
      { name: "us-west4", value: "us-west4" },
    ];
  }
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
export { newUniqueId };
