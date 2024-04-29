import { join, resolve } from "path";
import { confirm, promptOnce } from "../../../prompt";
import { readFileSync } from "fs";
import { Config } from "../../../config";
import { Setup } from "../..";
import { provisionCloudSql } from "../../../dataconnect/provisionCloudSql";

const TEMPLATE_ROOT = resolve(__dirname, "../../../../templates/init/dataconnect/");

const DATACONNECT_YAML_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "dataconnect.yaml"), "utf8");
const CONNECTOR_YAML_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "connector.yaml"), "utf8");
const SCHEMA_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "schema.gql"), "utf8");
const QUERIES_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "queries.gql"), "utf8");
const MUTATIONS_TEMPLATE = readFileSync(join(TEMPLATE_ROOT, "mutations.gql"), "utf8");

export async function doSetup(setup: Setup, config: Config): Promise<void> {
  const serviceId = await promptOnce({
    message: "What ID would you like to use for this service?",
    type: "input",
    default: "dataconnect",
  });
  // TODO: use listLocations API instead of hardcoding this
  const locationId = await promptOnce({
    message: "What location would you like to deploy this service into?",
    type: "list",
    choices: [
      { name: "us-central1", value: "us-central1" },
      { name: "asia-southeast1", value: "asia-southeast1" },
    ],
  });
  // TODO: Guided prompts to set up connector auth mode and generate
  const connectorId = await promptOnce({
    message: "What ID would you like to use for your connector?",
    type: "input",
    default: "my-connector",
  });
  const dir: string =
    config.get("dataconnect.source") ||
    (await promptOnce({
      message: "What directory should be used for DataConnect config and schema?",
      type: "input",
      default: "dataconnect",
    }));
  if (!config.has("dataconnect")) {
    config.set("dataconnect.source", dir);
    config.set("dataconnect.location", locationId);
  }
  // TODO: Listinstances from CloudSQL, and filter to only the free trial appropriate ones.
  const cloudSqlInstanceId = await promptOnce({
    message: `What CloudSQL instance would you like to use? Please enter the ID of an existing instance in ${locationId}`,
    type: "input",
    default: `dataconnect-test`,
  });
  // TODO: ListDatabases from CloudSQL.
  const cloudSqlDatabase = await promptOnce({
    message: `Which database would you like to use from ${cloudSqlInstanceId}?`,
    type: "input",
    default: `dataconnect-test`,
  });

  // postgresql://localhost:5432 is a default out of the box value for most installations of Postgres
  const defaultConnectionString =
    setup.rcfile.dataconnectEmulatorConfig?.postgres?.localConnectionString ??
    "postgresql://localhost:5432?sslmode=disable";
  // TODO: Download Postgres
  const localConnectionString = await promptOnce({
    type: "input",
    name: "localConnectionString",
    message: `What is the connection string of the local Postgres instance you would like to use with the Data Connect emulator?`,
    default: defaultConnectionString,
  });
  setup.rcfile.dataconnectEmulatorConfig = { postgres: { localConnectionString } };
  const subbedDataconnectYaml = subValues(DATACONNECT_YAML_TEMPLATE, {
    serviceId,
    cloudSqlInstanceId,
    cloudSqlDatabase,
    connectorId,
  });

  const subbedConnectorYaml = subValues(CONNECTOR_YAML_TEMPLATE, {
    serviceId,
    cloudSqlInstanceId,
    cloudSqlDatabase,
    connectorId,
  });
  await config.askWriteProjectFile(join(dir, "dataconnect.yaml"), subbedDataconnectYaml);
  await config.askWriteProjectFile(join(dir, "connector", "connector.yaml"), subbedConnectorYaml);
  await config.askWriteProjectFile(join(dir, "schema", "schema.gql"), SCHEMA_TEMPLATE);
  await config.askWriteProjectFile(join(dir, "connector", "queries.gql"), QUERIES_TEMPLATE);
  await config.askWriteProjectFile(join(dir, "connector", "mutations.gql"), MUTATIONS_TEMPLATE);
  // TODO: Skip this for existing instances
  if (
    setup.projectId &&
    (await confirm({
      message:
        "Would you like to provision your CloudSQL instance and database now? This will take a few minutes.",
      default: true,
    }))
  ) {
    await provisionCloudSql({
      projectId: setup.projectId,
      locationId,
      instanceId: cloudSqlInstanceId,
      databaseId: cloudSqlDatabase,
      enableGoogleMlIntegration: false,
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
