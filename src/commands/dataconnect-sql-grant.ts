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
import { getResourceFilters } from "../dataconnect/filters";

const allowedRoles = Object.keys(fdcSqlRoleMap);

export const command = new Command("dataconnect:sql:grant")
  .description("grants the SQL role <role> to the provided user or service account <email>")
  .option(
    "--only <serviceId>",
    "the service ID to grant permissions to. Supported formats: dataconnect:serviceId, dataconnect:locationId:serviceId",
  )
  .option("-R, --role <role>", "The SQL role to grant. One of: owner, writer, or reader.")
  .option(
    "-E, --email <email>",
    "The email of the user or service account we would like to grant the role to.",
  )
  .before(requirePermissions, ["firebasedataconnect.services.list"])
  .before(requireAuth)
  .action(async (options: Options) => {
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
    const filters = getResourceFilters(options);
    let serviceId: string | undefined;
    if (filters) {
      if (filters.length > 1) {
        throw new FirebaseError("Cannot specify more than one service to grant.", { exit: 1 });
      }
      const f = filters[0];
      if (f.schemaOnly) {
        throw new FirebaseError(
          `--only filter for dataconnect:sql:grant must be a service ID (e.g. --only dataconnect:my-service)`,
        );
      }
      serviceId = f.connectorId ? `${f.serviceId}:${f.connectorId}` : f.serviceId;
    }
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);

    await grantRoleToUserInSchema(options, serviceInfo.schema);
    return { projectId, serviceId: serviceInfo.dataConnectYaml.serviceId };
  });
