import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { pickService } from "../dataconnect/fileUtils";
import { FirebaseError } from "../error";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import { setupSQLPermissions, getSchemaMetadata } from "../gcp/cloudsql/permissionsSetup";
import { DEFAULT_SCHEMA } from "../gcp/cloudsql/permissions";
import { getIdentifiers, ensureServiceIsConnectedToCloudSql } from "../dataconnect/schemaMigration";
import { getIAMUser } from "../gcp/cloudsql/connect";
import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";

export const command = new Command("dataconnect:sql:setup [serviceId]")
  .description("set up your CloudSQL database")
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

    const { serviceName, instanceName, databaseId } = getIdentifiers(serviceInfo.schema);
    await ensureServiceIsConnectedToCloudSql(
      serviceName,
      instanceName,
      databaseId,
      /* linkIfNotConnected=*/ true,
    );

    // Create an IAM user for the current identity.
    const { user, mode } = await getIAMUser(options);
    await cloudSqlAdminClient.createUser(projectId, instanceId, mode, user);

    const schemaInfo = await getSchemaMetadata(instanceId, databaseId, DEFAULT_SCHEMA, options);
    await setupSQLPermissions(instanceId, databaseId, schemaInfo, options);
  });
