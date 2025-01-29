import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { pickService } from "../dataconnect/fileUtils";
import { FirebaseError } from "../error";
import { migrateSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import { logLabeledSuccess } from "../utils";
import {
  getTablesMetaData,
  setupSQLPermissions,
  determineSchemaSetupStatus,
  SchemaSetupStatus,
  firebaseowner,
  iamUserIsCSQLAdmin,
  setupBrownfieldAsGreenfield,
  setupBrownfieldSQL
} from "../gcp/cloudsql/permissions";
import { getIdentifiers } from "../dataconnect/schemaMigration";
import { logger } from "../logger";
import { promptOnce, confirm } from "../prompt";
import * as clc from "colorette";


export async function setupSchema(instanceId: string, databaseId: string, schema: string, options: Options) {
  logger.info(`Attempting to Setup SQL schema "${schema}".`)
  const userIsCSQLAdmin = await iamUserIsCSQLAdmin(options);
  if (!userIsCSQLAdmin) {
    throw new FirebaseError(`Only users with 'roles/cloudsql.admin' can setup SQL schemas.`)
  }

  const setupStatus = await determineSchemaSetupStatus(instanceId, databaseId, schema, options)
  if (setupStatus.setupStatus === SchemaSetupStatus.NotFound) {

  }
  if (setupStatus.setupStatus === SchemaSetupStatus.GreenField) {
    logger.info(`Detected schema "${schema}" is setup in greenfield mode. Skipping Setup.`)
    return
  }
  else if (setupStatus.setupStatus === SchemaSetupStatus.BrownField) {
    logger.info(`Detected schema "${schema}" is setup in brownfield mode.`)
  } else {
    logger.info(clc.yellow(`SQL database doesn't seem setup, continuing setup.`))
  }
  // If empty schema -> greenfield
  const tables = await getTablesMetaData(instanceId, databaseId, schema, options)
  if (tables.length === 0) {
    logger.info(clc.yellow(`Found no tables in schema "${schema}", assuming greenfield project.`))
    setupSQLPermissions(instanceId, databaseId, options)
    return
  } else {
    const tables = await getTablesMetaData(instanceId, databaseId, schema, options)
    const currentTablesOwners = [...new Set(tables.map(t => t.owner))]
    logger.info(`We found some existing object owners [${currentTablesOwners.join(", ")}] in your cloudsql "${schema}" schema.`)
    
    const continueSetup = await confirm({
      message: clc.yellow(`Would you like FDC to handle SQL migrations for you moving forward?\n\
        This means we will transfer schema ownership to ${firebaseowner(databaseId, schema)}\n\
        Note: your existing migration tools/roles may lose access.`),
      default: false,
    });

    if (continueSetup) {
      setupBrownfieldAsGreenfield(instanceId, databaseId, options)
    } else {
      setupBrownfieldSQL(instanceId, databaseId, options)
    }
  }

  return
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

    // TODO: Support non public schema
    await setupSchema(instanceId, databaseId, "public", options)
  });
