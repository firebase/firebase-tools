import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickService } from "../dataconnect/fileUtils";
import { grantRoleToUserInSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";

export const command = new Command("dataconnect:sql:grant [serviceId]")
  .description("Grants the SQL role <role> to the provided user or service account <email>.")
  .option("-R, --role <role>", "The SQL role to grant. One of: owner, writer, or reader.")
  .option(
    "-E, --email <email>",
    "The email of the user or service account we would like to grant the role to.",
  )
  .before(requirePermissions, ["firebasedataconnect.services.list"])
  .before(requireAuth)
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);

    await grantRoleToUserInSchema(options, serviceInfo.schema);
    return { projectId, serviceId };
  });
