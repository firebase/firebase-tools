import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickService } from "../dataconnect/load";
import { diffSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { getResourceFilters } from "../dataconnect/filters";
import { FirebaseError } from "../error";

export const command = new Command("dataconnect:sql:diff")
  .description(
    "display the differences between a local Data Connect schema and your CloudSQL database's current schema",
  )
  .option(
    "--only <serviceId>",
    "the service ID to diff. Supported formats: dataconnect:serviceId, dataconnect:locationId:serviceId",
  )
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
  ])
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const filters = getResourceFilters(options);
    let serviceId: string | undefined;
    if (filters) {
      if (filters.length > 1) {
        throw new FirebaseError("Cannot specify more than one service to diff.", { exit: 1 });
      }
      const f = filters[0];
      if (f.schemaOnly) {
        throw new FirebaseError(
          `--only filter for dataconnect:sql:diff must be a service ID (e.g. --only dataconnect:my-service)`,
        );
      }
      serviceId = f.connectorId ? `${f.serviceId}:${f.connectorId}` : f.serviceId;
    }
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);

    const diffs = await diffSchema(
      options,
      serviceInfo.schema,
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.schemaValidation,
    );
    return { projectId, serviceId: serviceInfo.dataConnectYaml.serviceId, diffs };
  });
