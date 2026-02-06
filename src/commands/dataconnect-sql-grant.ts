import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickOneService } from "../dataconnect/load";
import { grantRoleToUserInSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { fdcSqlRoleMap } from "../gcp/cloudsql/permissionsSetup";
import { iamUserIsCSQLAdmin } from "../gcp/cloudsql/cloudsqladmin";
import { mainSchema } from "../dataconnect/types";

const allowedRoles = Object.keys(fdcSqlRoleMap);

type GrantOptions = Options & {
  role?: string;
  email?: string;
  service?: string;
  location?: string;
};

export const command = new Command("dataconnect:sql:grant")
  .description("grants the SQL role <role> to the provided user or service account <email>")
  .option("-R, --role <role>", "The SQL role to grant. One of: owner, writer, or reader.")
  .option(
    "-E, --email <email>",
    "The email of the user or service account we would like to grant the role to.",
  )
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option(
    "--location <location>",
    "the location of the Data Connect service. Only needed if service ID is used in multiple locations.",
  )
  .before(requirePermissions, ["firebasedataconnect.services.list"])
  .before(requireAuth)
  .action(async (options: GrantOptions) => {
    if (!options.role) {
      throw new FirebaseError(
        "-R, --role <role> is required. Run the command with -h for more info.",
      );
    }
    if (!options.email) {
      throw new FirebaseError(
        "-E, --email <email> is required. Run the command with -h for more info.",
      );
    }

    if (!allowedRoles.includes(options.role.toLowerCase())) {
      throw new FirebaseError(`Role should be one of ${allowedRoles.join(" | ")}.`);
    }

    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickOneService(
      projectId,
      options.config,
      options.service,
      options.location,
    );

    // Make sure current user can perform this action.
    const userIsCSQLAdmin = await iamUserIsCSQLAdmin(options);
    if (!userIsCSQLAdmin) {
      throw new FirebaseError(
        `Only users with 'roles/cloudsql.admin' can grant SQL roles. If you do not have this role, ask your database administrator to run this command or manually grant ${options.role} to ${options.email}`,
      );
    }

    await grantRoleToUserInSchema(options, mainSchema(serviceInfo.schemas));
    return { projectId };
  });
