import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { pickService } from "../dataconnect/fileUtils";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import {
  type SchemaMetaData,
  SchemaSetupStatus,
  brownfieldSqlSetup,
  greenFieldSchemaSetup,
  setupBrownfieldAsGreenfield,
  iamUserIsCSQLAdmin,
  firebaseowner,
  DEFAULT_SCHEMA,
  getSchemaMetaData,
} from "../gcp/cloudsql/permissions";
import { setupIAMUsers } from "../gcp/cloudsql/connect";
import { logger } from "../logger";
import { getIdentifiers } from "../dataconnect/schemaMigration";
import { confirm } from "../prompt";
import * as clc from "colorette";

// Sets up all FDC roles (owner, writer, and reader).
// Granting roles to users is done by the caller.
// Returns true if schema is setup as greenfield
export async function setupSQLPermissions(
  instanceId: string,
  databaseId: string,
  schemaInfo: SchemaMetaData,
  options: Options,
  silent: boolean = false,
): Promise<boolean> {
  const schema = schemaInfo.name;
  // Step 0: Check current user can run setup and upsert IAM / P4SA users
  logger.info(`Attempting to Setup SQL schema "${schema}".`);
  const userIsCSQLAdmin = await iamUserIsCSQLAdmin(options);
  if (!userIsCSQLAdmin) {
    throw new FirebaseError(
      `Missing required IAM permission to setup SQL schemas. SQL schema setup requires 'roles/cloudsql.admin' or an equivalent role.`,
    );
  }
  await setupIAMUsers(instanceId, databaseId, options);

  if (schemaInfo.setupStatus === SchemaSetupStatus.GreenField) {
    const rerunSetup = await confirm({
      message: clc.yellow(
        "Seems like the database is already setup. Would you like to rerun the setup process?",
      ),
      default: false,
    });
    if (rerunSetup) {
      await greenFieldSchemaSetup(instanceId, databaseId, schema, options, silent);
      return true;
    }
  } else {
    logger.info(`Detected schema "${schema}" setup status is ${schemaInfo.setupStatus}.`);
  }

  // We need to setup the database
  if (schemaInfo.tables.length === 0) {
    logger.info(`Found no tables in schema "${schema}", assuming greenfield project.`);
    await greenFieldSchemaSetup(instanceId, databaseId, schema, options, silent);
    return true;
  }

  if (options.nonInteractive || options.force) {
    throw new FirebaseError(
      `Schema "${schema}" isn't setup and can only be setup in interactive mode.`,
    );
  }
  const currentTablesOwners = [...new Set(schemaInfo.tables.map((t) => t.owner))];
  logger.info(
    `We found some existing object owners [${currentTablesOwners.join(", ")}] in your cloudsql "${schema}" schema.`,
  );

  const shouldSetupGreenfield = await confirm({
    message: clc.yellow(
      "Would you like FDC to handle SQL migrations for you moving forward?\n" +
        `This means we will transfer schema and tables ownership to ${firebaseowner(databaseId, schema)}\n` +
        "Note: your existing migration tools/roles may lose access.",
    ),
    default: false,
  });

  if (shouldSetupGreenfield) {
    await setupBrownfieldAsGreenfield(instanceId, databaseId, schemaInfo, options, silent);
    return true;
  } else {
    logger.info(
      clc.yellow(
        "Setting up database in brownfield mode.\n" +
          `Note: SQL migrations can't be done through ${clc.bold("firebase dataconnect:sql:migrate")} in this mode.`,
      ),
    );
    await brownfieldSqlSetup(instanceId, databaseId, schemaInfo, options, silent);
  }

  return false;
}

export const command = new Command("dataconnect:sql:setup [serviceId]")
  .description("Setup your CloudSQL database")
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
    "cloudsql.instances.connect",
  ])
  .before(requireAuth)
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);
    const instanceId =
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.cloudSql.instanceId;
    if (!instanceId) {
      throw new FirebaseError(
        "dataconnect.yaml is missing field schema.datasource.postgresql.cloudsql.instanceId",
      );
    }

    const { databaseId } = getIdentifiers(serviceInfo.schema);

    const schemaInfo = await getSchemaMetaData(instanceId, databaseId, DEFAULT_SCHEMA, options);
    await setupSQLPermissions(instanceId, databaseId, schemaInfo, options);
  });
