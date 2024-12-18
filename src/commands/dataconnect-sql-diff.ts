import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { ensureApis } from "../dataconnect/ensureApis.js";
import { requirePermissions } from "../requirePermissions.js";
import { pickService } from "../dataconnect/fileUtils.js";
import { diffSchema } from "../dataconnect/schemaMigration.js";
import { requireAuth } from "../requireAuth.js";

export const command = new Command("dataconnect:sql:diff [serviceId]")
  .description(
    "displays the differences between  a local DataConnect schema and your CloudSQL database's current schema",
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
      serviceInfo.schema,
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.schemaValidation,
    );
    return { projectId, serviceId, diffs };
  });
