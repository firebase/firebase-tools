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
import { getResourceFilters } from "../dataconnect/filters";

export const command = new Command("dataconnect:sql:setup")
  .description("set up your CloudSQL database")
  .option(
    "--only <serviceId>",
    "the service ID to setup. Supported formats: dataconnect:serviceId, dataconnect:locationId:serviceId",
  )
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
    "cloudsql.instances.connect",
  ])
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const filters = getResourceFilters(options);
    let serviceId: string | undefined;
    if (filters) {
      if (filters.length > 1) {
        throw new FirebaseError("Cannot specify more than one service to setup.", { exit: 1 });
      }
      const f = filters[0];
      if (f.schemaOnly) {
        throw new FirebaseError(
          `--only filter for dataconnect:sql:setup must be a service ID (e.g. --only dataconnect:my-service)`,
        );
      }
      serviceId = f.connectorId ? `${f.serviceId}:${f.connectorId}` : f.serviceId;
    }
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

    // Setup the IAM user for the current identity.
    await setupIAMUsers(instanceId, options);

    const schemaInfo = await getSchemaMetadata(instanceId, databaseId, DEFAULT_SCHEMA, options);
    await setupSQLPermissions(instanceId, databaseId, schemaInfo, options);
  });
