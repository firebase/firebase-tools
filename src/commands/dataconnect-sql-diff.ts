import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensure } from "../ensureApiEnabled";
import { dataconnectOrigin } from "../api";
import { pickService } from "../dataconnect/fileUtils";
import { diffSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";

export const command = new Command("dataconnect:sql:diff [serviceId]")
  .description(
    "displays the differences between  a local DataConnect schema and your CloudSQL database's current schema",
  )
  // .before(requirePermissions, ["dataconnect.services.list", "dataconnect.schemas.list", "dataconnect.connectors.list"])
  .before(requireAuth)
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensure(projectId, new URL(dataconnectOrigin()).hostname, "dataconnect");
    const serviceInfo = await pickService(projectId, options.config, serviceId);

    const diffs = await diffSchema(serviceInfo.schema);
    return { projectId, serviceId, diffs };
  });
