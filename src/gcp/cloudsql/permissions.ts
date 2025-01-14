import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { executeSqlCmdsAsIamUser, executeSqlCmdsAsSuperUser, getIAMUser } from "./connect";
import { testIamPermissions } from "../iam";
import { logger } from "../../logger";
import { concat } from "lodash";
import { FirebaseError } from "../../error";

export function firebaseowner(databaseId: string) {
  return `firebaseowner_${databaseId}_public`;
}

export function firebasereader(databaseId: string) {
  return `firebasereader_${databaseId}_public`;
}

export function firebasewriter(databaseId: string) {
  return `firebasewriter_${databaseId}_public`;
}

export const fdcSqlRoleMap = {
  owner: firebaseowner,
  writer: firebasewriter,
  reader: firebasereader,
};

export type TableMetaData = {
  name: string;
  owner: string;
  hasRowSecurity: boolean
}

// Returns true if "grantedRole" is granted to "granteeRole" and false otherwise.
// Throw an error if commands fails due to another reason like connection issues.
export async function checkSQLRoleIsGranted(
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
    await executeSqlCmdsAsIamUser(options, instanceId, databaseId, [checkCmd], /** silent=*/ true);
    return true;
  } catch (e) {
    // We only return false after we confirm the error is indeed because the role isn't granted.
    // Otherwise we propagate the error.
    if (e instanceof FirebaseError && e.message.includes("not granted to role")) {
      return false;
    }
    logger.error(`Role Check Failed: ${e}`);
    throw e;
  }
}

export async function iamUserIsCSQLAdmin(options: Options): Promise<boolean> {
  const projectId = needProjectId(options);
  const requiredPermissions = [
    "cloudsql.instances.connect",
    "cloudsql.instances.get",
    "cloudsql.users.create",
    "cloudsql.users.update",
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
// Granting roles to users is done by the caller.
export async function setupSQLPermissions(
  instanceId: string,
  databaseId: string,
  options: Options,
  silent: boolean = false,
) {
  const superuser = "firebasesuperuser";

  // Detect the minimal necessary revokes to avoid errors for users who used the old sql permissions setup.
  const revokes = [];
  if (
    await checkSQLRoleIsGranted(
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
    // For backward compatibality we sometimes need to revoke some roles.
    revokes,

    // We shoud make sure schema exists since this setup runs prior to executing the diffs.
    [`CREATE SCHEMA IF NOT EXISTS "public"`],

    // Create and setup the owner role permissions.
    ownerRolePermissions(databaseId, superuser, "public"),

    // Create and setup writer role permissions.
    writerRolePermissions(databaseId, superuser, "public"),

    // Create and setup reader role permissions.
    readerRolePermissions(databaseId, superuser, "public"),
  );

  return executeSqlCmdsAsSuperUser(options, instanceId, databaseId, sqlRoleSetupCmds, silent);
}

export enum SchemaSetupStatus {
  NotSetup = 'not-setup',
  GreenField = 'greenfield',
  BrownField = 'brownfield',
  Unknown = 'unknown', // We couldn't figure it out, possibly because of partial setup
}

export enum UserAccessLevel {
  OWNER = 'owner',
  WRITER = 'writer',
  READER = 'reader',
  NONE = 'none'
}

export async function getTablesMetaData(instanceId: string, databaseId: string, schema: string, options: Options): Promise<TableMetaData[] | null> {
  const cmd = `SELECT ("tablename", "tableowner", "rowsecurity") FROM pg_tables WHERE schemaname='${schema}'`

  try {
    const res = await executeSqlCmdsAsSuperUser(options, instanceId, databaseId, [cmd], /** silent=*/ true);
    const tables = res[0].rows.map(row => {
      return {
        name: row.tablename,
        owner: row.tableowner,
        hasRowSecurity: row.rowsecurity}})

    return tables;
  } catch (e) {
    logger.error(`Failed To get tables metadata with error: ${e}`)
    return null
  }
}

export async function getUserAccessLevel(instanceId: string, databaseId: string, options: Options): Promise<UserAccessLevel> {
  const iamUser = (await getIAMUser(options)).user;

  const checkUserMembership = async (role: string): Promise<boolean> => {
    const cmd = [`SELECT pg_has_role('${iamUser}', '${role}', 'member');`]
    try {
      const results = await executeSqlCmdsAsIamUser(options, instanceId, databaseId, cmd, /** silent=*/ true)
      return results[0].rows[0].pg_has_role
    } catch (e) {
      if (e instanceof FirebaseError && e.message.includes(`role "${role}" does not exist`)) {
        return false
      } else {
        throw e
      }
    }
  }

  if (await (checkUserMembership(firebaseowner(databaseId)))) {
    return UserAccessLevel.OWNER
  }
  if (await checkUserMembership(firebasewriter(databaseId))) {
    return UserAccessLevel.WRITER
  }
  if (await checkUserMembership(firebasereader(databaseId))) {
    return UserAccessLevel.READER
  }
  return UserAccessLevel.NONE
}

// Used for migration, greenfield and brownfield setup
// Note: this is a quick check, it wouldn't catch cases where setup was possibly interrupted and setup is in intermediate state.
export async function determineSchemaSetupStatus(instanceId: string, databaseId: string, options: Options): Promise<SchemaSetupStatus> {
  const checkRoleExists = async (role: string): Promise<boolean> => {
    const cmd = [`SELECT to_regrole('"${role}"') IS NOT NULL;`]
    const result = await executeSqlCmdsAsIamUser(options, instanceId, databaseId, cmd, /** silent=*/ true)
    return result[0].rows[0]
  }
  // If owner exists -> greenfield
  if (await checkRoleExists(firebaseowner(databaseId))) {
    return SchemaSetupStatus.GreenField
  }
  // If writer exists -> brownfield
  if (await checkRoleExists(firebasewriter(databaseId))) {
    return SchemaSetupStatus.BrownField
  }

  return SchemaSetupStatus.NotSetup
}

export async function greenFieldSQLSetup(
  instanceId: string,
  databaseId: string,
  options: Options,
  silent: boolean = false,
) {
  // Step 0: Get tables metadata and prompt user for action if any tables found
  

  // Step 1: Confirm or Create firebase roles

  // Step 2: Give the specified owner writer permissions

  // Step 3: Transfer ownership from original owner to firebaseowner

  // Step 4: Grant P4SA and User needed permissions
}


export async function brownFieldSQLSetup(
  instanceId: string,
  databaseId: string,
  options: Options,
  silent: boolean = false,
) {
  // Step 0: Get tables metadata and prompt user for action if any tables found

  // Step 1: Grant firebasesuperuser access to the original owner

  // Step 2: Using firebasesuperuser, grant reader and writer permissions on existing tables and setup default permissions for future tables

  // Step 3: 
}