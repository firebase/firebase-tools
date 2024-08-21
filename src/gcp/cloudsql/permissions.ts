import { Options } from "../../options";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import { dataconnectP4SADomain } from "../../api";
import { toDatabaseUser, executeSqlCmdsAsIamUser, executeSqlCmdsAsSuperUser } from "./connect";
import { testIamPermissions } from "../iam";
import { logger } from "../../logger";
import { concat } from "lodash";
import * as utils from "../../utils";
import * as cloudSqlAdminClient from "./cloudsqladmin";

export function firebaseowner(databaseId: string) {
  return `firebaseowner_${databaseId}_public`;
}

export function firebasereader(databaseId: string) {
  return `firebasereader_${databaseId}_public`;
}

export function firebasewriter(databaseId: string) {
  return `firebasewriter_${databaseId}_public`;
}

export function getDataConnectP4SA(projectNumber: string): string {
  return `service-${projectNumber}@${dataconnectP4SADomain()}`;
}

async function checkRoleIsGranted(
  options: Options,
  instanceId: string,
  databaseId: string,
  grantedRole: string,
  granteeRole: string,
): Promise<boolean> {
  const checkCmd = `
    DO $$
    DECLARE
        role_count INTEGER;
    BEGIN
        -- Count the number of rows matching the criteria
        SELECT COUNT(*)
        INTO role_count
        FROM
          pg_auth_members m
        JOIN
          pg_roles grantee ON grantee.oid = m.member
        JOIN
          pg_roles granted ON granted.oid = m.roleid
        JOIN
          pg_roles grantor ON grantor.oid = m.grantor
        WHERE
          granted.rolname = '${grantedRole}'
          AND grantee.rolname = '${granteeRole}';

        -- If no rows were found, raise an exception
        IF role_count = 0 THEN
            RAISE EXCEPTION 'Role "%", is not granted to role "%".', '${grantedRole}', '${granteeRole}';
        END IF;
    END $$;
`;
  try {
    await executeSqlCmdsAsIamUser(options, instanceId, databaseId, [checkCmd], true);
    return true;
  } catch {
    return false;
  }
}

export async function iamUserIsCSQLAdmin(options: Options): Promise<boolean> {
  const projectId = needProjectId(options);
  const requiredPermissions = [
    "cloudsql.databases.create",
    "cloudsql.databases.update",
    "cloudsql.instances.connect",
    "cloudsql.instances.create",
    "cloudsql.instances.get",
    "cloudsql.instances.list",
    "cloudsql.instances.update",
    "cloudsql.users.create",
  ];

  try {
    const iamResult = await testIamPermissions(projectId, requiredPermissions);
    return iamResult.passed;
  } catch (err: any) {
    logger.debug(`[iam] error while checking permissions, command may fail: ${err}`);
    return false;
  }
}

// Creates the owner role, modifies schema owner to firebaseowner.
function ownerRolePermissions(databaseId: string, superuser: string, schema: string): string[] {
  const firebaseOwnerRole = firebaseowner(databaseId);
  return [
    `do
        $$
        begin
          if not exists (select FROM pg_catalog.pg_roles
            WHERE  rolname = '${firebaseOwnerRole}') then
            CREATE ROLE "${firebaseOwnerRole}" WITH ADMIN "${superuser}";
          end if;
        end
        $$
        ;`,

    // We grant owner to cloudsqlsuperuser because only the owner can alter the schema owner.
    // It's also needed for the reader and write roles setup as only owner can alter schema defaults.
    `GRANT "${firebaseOwnerRole}" TO "cloudsqlsuperuser"`,

    `ALTER SCHEMA "${schema}" OWNER TO "${firebaseOwnerRole}"`,
    `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
    `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseOwnerRole}"`,
  ];
}

// The SQL permissions required for a role to read/write the FDC databases.
// Requires the firebase_owner_* role to be the owner of the schema for default permissions.
function writerRolePermissions(databaseId: string, superuser: string, schema: string): string[] {
  const firebaseWriterRole = firebasewriter(databaseId);
  return [
    `do
        $$
        begin
          if not exists (select FROM pg_catalog.pg_roles
            WHERE  rolname = '${firebaseWriterRole}') then
            CREATE ROLE "${firebaseWriterRole}" WITH ADMIN "${superuser}";
          end if;
        end
        $$
      ;`,

    `GRANT "${firebaseWriterRole}" TO "cloudsqlsuperuser"`,

    `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseWriterRole}"`,

    // Grant writer role SELECT, INSERT, UPDATE, DELETE on all tables
    // (You might want to exclude certain sensitive tables)
    `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,

    // Grant writer usage on sequences for nextval() in inserts
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,

    // Grant execution on function which could be needed by some extensions.
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO "${firebaseWriterRole}"`,

    // Set reader defaults for new tables
    `SET ROLE = '${firebaseowner(databaseId)}';`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO "${firebaseWriterRole}";`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT USAGE ON SEQUENCES TO "${firebaseWriterRole}";`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT EXECUTE ON FUNCTIONS TO "${firebaseWriterRole}"`,
    `SET ROLE = cloudsqlsuperuser`,
  ];
}

// The SQL permissions required for a role to read the FDC databases.
// Requires the firebase_owner_* role to be the owner of the schema for default permissions.
function readerRolePermissions(databaseId: string, superuser: string, schema: string): string[] {
  const firebaseReaderRole = firebasereader(databaseId);
  return [
    `do
        $$
        begin
          if not exists (select FROM pg_catalog.pg_roles
            WHERE  rolname = '${firebaseReaderRole}') then
            CREATE ROLE "${firebaseReaderRole}" WITH ADMIN "${superuser}";
          end if;
        end
        $$
      ;`,

    `GRANT "${firebaseReaderRole}" TO "cloudsqlsuperuser"`,

    `GRANT USAGE ON SCHEMA "${schema}" TO "${firebaseReaderRole}"`,

    `GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,

    // Grant reader usage on sequences for nextval()
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,

    // Grant execution on function which could be needed by some extensions.
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO "${firebaseReaderRole}"`,

    // Set reader defaults for new tables.
    // Only the owner of the schema can set defaults.
    `SET ROLE = '${firebaseowner(databaseId)}';`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT SELECT ON TABLES TO "${firebaseReaderRole}";`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT SELECT, USAGE ON SEQUENCES TO "${firebaseReaderRole}";`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT EXECUTE ON FUNCTIONS TO "${firebaseReaderRole}"`,
    `SET ROLE = cloudsqlsuperuser`,
  ];
}

// Sets up all FDC roles (owner, writer, and reader).
// Creates the P4SA database user and grants it writer role.
// Returns the superuser name and password if further setup is needed by caller (e.g Granting roles to users).
export async function setupSQLPermissions(
  instanceId: string,
  databaseId: string,
  options: Options,
  silent: boolean = false,
) {
  const projectId = needProjectId(options);

  // 1. Create a temporary builtin user
  const superuser = "firebasesuperuser";
  const temporaryPassword = utils.generateId(20);
  await cloudSqlAdminClient.createUser(
    projectId,
    instanceId,
    "BUILT_IN",
    superuser,
    temporaryPassword,
  );

  // 2. Upsert dataconnenct P4SA user in case it's not created.
  const projectNumber = await needProjectNumber(options);
  const { user: dataconnectDBUser, mode } = toDatabaseUser(getDataConnectP4SA(projectNumber));
  await cloudSqlAdminClient.createUser(projectId, instanceId, mode, dataconnectDBUser);

  // 3. Detect the minimal necessary revokes to avoid errors for users who used the old sql permissions setup.
  const revokes = [];
  if (
    await checkRoleIsGranted(
      options,
      instanceId,
      databaseId,
      "cloudsqlsuperuser",
      firebaseowner(databaseId),
    )
  ) {
    logger.warn(
      "Detected cloudsqlsuperuser was previously given to firebase owner, revoking to improve database security.",
    );
    revokes.push(`REVOKE "cloudsqlsuperuser" FROM "${firebaseowner(databaseId)}"`);
  }

  const sqlRoleSetupCmds = concat(
    // For backward compatibality we sometimes need to revoke some roles
    revokes,

    // Create and setup the owner role permissions.
    ownerRolePermissions(databaseId, superuser, "public"),

    // Create and setup writer role permissions.
    writerRolePermissions(databaseId, superuser, "public"),

    // Create and setup reader role permissions.
    readerRolePermissions(databaseId, superuser, "public"),

    // Grant FDC P4SA database user the writer role.
    [`GRANT "${firebasewriter(databaseId)}" TO "${dataconnectDBUser}"`],
  );

  return executeSqlCmdsAsSuperUser(options, instanceId, databaseId, sqlRoleSetupCmds, silent);
}
