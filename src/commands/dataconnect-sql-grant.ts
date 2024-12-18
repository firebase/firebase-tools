import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { ensureApis } from "../dataconnect/ensureApis.js";
import { requirePermissions } from "../requirePermissions.js";
import { pickService } from "../dataconnect/fileUtils.js";
import { grantRoleToUserInSchema } from "../dataconnect/schemaMigration.js";
import { requireAuth } from "../requireAuth.js";
import { FirebaseError } from "../error.js";
import { fdcSqlRoleMap } from "../gcp/cloudsql/permissions.js";

const allowedRoles = Object.keys(fdcSqlRoleMap);

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
    const role = options.role as string;
    const email = options.email as string;
    if (!role) {
      throw new FirebaseError(
        "-R, --role <role> is required. Run the command with -h for more info.",
      );
    }
    if (!email) {
      throw new FirebaseError(
        "-E, --email <email> is required. Run the command with -h for more info.",
      );
    }

    if (!allowedRoles.includes(role.toLowerCase())) {
      throw new FirebaseError(`Role should be one of ${allowedRoles.join(" | ")}.`);
    }

    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);

    await grantRoleToUserInSchema(options, serviceInfo.schema);
    return { projectId, serviceId };
  });
