import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickService } from "../dataconnect/load";
import { grantRoleToUserInSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { fdcSqlRoleMap } from "../gcp/cloudsql/permissionsSetup";
import { iamUserIsCSQLAdmin } from "../gcp/cloudsql/cloudsqladmin";

const allowedRoles = Object.keys(fdcSqlRoleMap);

export const command = new Command("dataconnect:sql:grant")
  .description("grants the SQL role <role> to the provided user or service account <email>")
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option("--location <location>", "the location of the Data Connect service to disambiguate")
  .option("-R, --role <role>", "The SQL role to grant. One of: owner, writer, or reader.")
  .option(
    "-E, --email <email>",
    "The email of the user or service account we would like to grant the role to.",
  )
  .before(requirePermissions, ["firebasedataconnect.services.list"])
  .before(requireAuth)
  .action(async (options: Options) => {
    if (!options.service) {
      throw new FirebaseError("Missing required flag --service");
    }
    const serviceId = options.service as string;
    const location = options.location as string;
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

    // Make sure current user can perform this action.
    const userIsCSQLAdmin = await iamUserIsCSQLAdmin(options);
    if (!userIsCSQLAdmin) {
      throw new FirebaseError(
        `Only users with 'roles/cloudsql.admin' can grant SQL roles. If you do not have this role, ask your database administrator to run this command or manually grant ${role} to ${email}`,
      );
    }

    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId, location);

    await grantRoleToUserInSchema(options, serviceInfo.schema);
    return { projectId, serviceId };
  });
