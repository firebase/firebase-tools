import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { pickService } from "../dataconnect/load";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import { setupSQLPermissions, getSchemaMetadata } from "../gcp/cloudsql/permissionsSetup";
import { DEFAULT_SCHEMA } from "../gcp/cloudsql/permissions";
import { getIdentifiers, ensureServiceIsConnectedToCloudSql } from "../dataconnect/schemaMigration";
import { setupIAMUsers } from "../gcp/cloudsql/connect";

export const command = new Command("dataconnect:sql:setup")
  .description("set up your CloudSQL database")
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option("--location <location>", "the location of the Data Connect service", "us-central1")
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
    "cloudsql.instances.connect",
  ])
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (!options.service) {
      throw new FirebaseError("Missing required flag --service");
    }
    const serviceId = options.service as string;
    const location = options.location as string;
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId, location);
    const instanceId =
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.cloudSql.instanceId;
    if (!instanceId) {
      throw new FirebaseError(
        "dataconnect.yaml is missing field schema.datasource.postgresql.cloudsql.instanceId",
      );
    }

    const { serviceName, instanceName, databaseId } = getIdentifiers(serviceInfo.schema);
    await ensureServiceIsConnectedToCloudSql(
      serviceName,
      instanceName,
      databaseId,
      /* linkIfNotConnected=*/ true,
    );

    // Setup the IAM user for the current identity.
    await setupIAMUsers(instanceId, options);

    const schemaInfo = await getSchemaMetadata(instanceId, databaseId, DEFAULT_SCHEMA, options);
    await setupSQLPermissions(instanceId, databaseId, schemaInfo, options);
  });
