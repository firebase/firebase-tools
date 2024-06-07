import { join, resolve } from "path";
import { confirm, promptOnce } from "../../../prompt";
import { readFileSync } from "fs";
import { Config } from "../../../config";
import { Setup } from "../..";
import { provisionCloudSql } from "../../../dataconnect/provisionCloudSql";
import { checkForFreeTrialInstance } from "../../../dataconnect/freeTrial";
import * as cloudsql from "../../../gcp/cloudsql/cloudsqladmin";
import { ensureApis } from "../../../dataconnect/ensureApis";
import { listLocations, listAllServices, getSchema } from "../../../dataconnect/client";
import { Schema, Service } from "../../../dataconnect/types";
import { DEFAULT_POSTGRES_CONNECTION } from "../emulators";
import { parseCloudSQLInstanceName, parseServiceName } from "../../../dataconnect/names";
import { logger } from "../../../logger";

const TEMPLATE_ROOT = resolve(__dirname, "../../../../templates/init/dataconnect/");

const DATACONNECT_YAML_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "dataconnect.yaml"), "utf8");
const CONNECTOR_YAML_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "connector.yaml"), "utf8");
const SCHEMA_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "schema.gql"), "utf8");
const QUERIES_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "queries.gql"), "utf8");
const MUTATIONS_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "mutations.gql"), "utf8");

interface RequiredInfo {
  serviceId: string;
  locationId: string;
  cloudSqlInstanceId: string;
  cloudSqlDatabase: string;
  connectorId: string;
  isNewInstance: boolean;
  isNewDatabase: boolean;
}
export async function doSetup(setup: Setup, config: Config): Promise<void> {
  let info: RequiredInfo = {
    serviceId: "",
    locationId: "",
    cloudSqlInstanceId: "",
    isNewInstance: false,
    cloudSqlDatabase: "",
    isNewDatabase: false,
    connectorId: "default-connector",
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

  const dir: string = config.get("dataconnect.source") || "dataconnect";
  const subbedDataconnectYaml = subValues(DATACONNECT_YAML_TEMPLATE, info);
  const subbedConnectorYaml = subValues(CONNECTOR_YAML_TEMPLATE, info);

  if (!config.has("dataconnect")) {
    config.set("dataconnect.source", dir);
    config.set("dataconnect.location", info.locationId);
  }
  await config.askWriteProjectFile(join(dir, "dataconnect.yaml"), subbedDataconnectYaml);
  await config.askWriteProjectFile(join(dir, "schema", "schema.gql"), SCHEMA_TEMPLATE);
  await config.askWriteProjectFile(
    join(dir, info.connectorId, "connector.yaml"),
    subbedConnectorYaml,
  );
  await config.askWriteProjectFile(join(dir, info.connectorId, "queries.gql"), QUERIES_TEMPLATE);
  await config.askWriteProjectFile(
    join(dir, info.connectorId, "mutations.gql"),
    MUTATIONS_TEMPLATE,
  );

  if (
    setup.projectId &&
    (info.isNewInstance || info.isNewDatabase) &&
    (await confirm({
      message:
        "Would you like to provision your CloudSQL instance and database now? This will take a few minutes.",
      default: true,
    }))
  ) {
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

function subValues(
  template: string,
  replacementValues: {
    serviceId: string;
    cloudSqlInstanceId: string;
    cloudSqlDatabase: string;
    connectorId: string;
  },
): string {
  const replacements: Record<string, string> = {
    serviceId: "__serviceId__",
    cloudSqlDatabase: "__cloudSqlDatabase__",
    cloudSqlInstanceId: "__cloudSqlInstanceId__",
    connectorId: "__connectorId__",
  };
  let replaced = template;
  for (const [k, v] of Object.entries(replacementValues)) {
    replaced = replaced.replace(replacements[k], v);
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
    const existingFreshServicesAndSchemas = existingServicesAndSchemas.filter((s) => {
      return !s.schema?.source.files?.length;
    });
    if (existingFreshServicesAndSchemas.length) {
      const choices: { name: string; value: any }[] = existingFreshServicesAndSchemas.map((s) => {
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
          info.cloudSqlDatabase = choice.schema.primaryDatasource.postgresql?.database ?? "";
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
