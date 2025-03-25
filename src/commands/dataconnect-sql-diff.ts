import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickService } from "../dataconnect/fileUtils";
import { diffSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";

export const command = new Command("dataconnect:sql:diff [serviceId]")
  .description(
    "display the differences between a local Data Connect schema and your CloudSQL database's current schema",
  )
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
  ])
  .before(requireAuth)
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);

    const diffs = await diffSchema(
      options,
      serviceInfo.schema,
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.schemaValidation,
    );
    return { projectId, serviceId, diffs };
  });
