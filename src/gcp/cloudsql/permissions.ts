import { Options } from "../../options";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import { executeSqlCmdsAsIamUser, executeSqlCmdsAsSuperUser, getIAMUser, setupIAMUsers } from "./connect";
import { testIamPermissions } from "../iam";
import { logger } from "../../logger";
import { concat } from "lodash";
import { FirebaseError } from "../../error";
import { getDataConnectP4SA, toDatabaseUser } from "./connect";

export const DEFAULT_SCHEMA = 'public'
export const FIREBASE_SUPER_USER = 'firebasesuperuser'

export function firebaseowner(databaseId: string, schema: string = DEFAULT_SCHEMA) {
  return `firebaseowner_${databaseId}_${schema}`;
}

export function firebasereader(databaseId: string, schema: string = DEFAULT_SCHEMA) {
  return `firebasereader_${databaseId}_${schema}`;
}

export function firebasewriter(databaseId: string, schema: string = DEFAULT_SCHEMA) {
  return `firebasewriter_${databaseId}_${schema}`;
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

export async function alterSchemaTablesOwners(databaseId:string, newOwner:string, schema:string) {
  return [
     `DO $$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = '${schema}'
                      AND table_type = 'BASE TABLE' -- Important: only base tables
          LOOP
            EXECUTE format('ALTER TABLE "${schema}.%I" OWNER TO "${newOwner}";', r.table_name);
          END LOOP;
        END $$;
        
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN SELECT sequence_name
                    FROM information_schema.sequences
                    WHERE sequence_schema = '${schema}'
          LOOP
            EXECUTE format('ALTER SEQUENCE "${schema}.%I" OWNER TO "${newOwner}";', r.sequence_name);
          END LOOP;
        END $$;
    `,
  ]
}

// Sets up all FDC roles (owner, writer, and reader).
// Granting roles to users is done by the caller.
export async function setupSQLPermissions(
  instanceId: string,
  databaseId: string,
  options: Options,
  silent: boolean = false,
) {
  const user = setupIAMUsers(instanceId, databaseId, options)

  const projectNumber = await needProjectNumber(options);
  const { user: fdcP4SAUser } = toDatabaseUser(
      getDataConnectP4SA(projectNumber),
  );
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
    [`CREATE SCHEMA IF NOT EXISTS "${DEFAULT_SCHEMA}"`],

    // Create and setup the owner role permissions.
    ownerRolePermissions(databaseId, FIREBASE_SUPER_USER, DEFAULT_SCHEMA),

    // Create and setup writer role permissions.
    writerRolePermissions(databaseId, FIREBASE_SUPER_USER, DEFAULT_SCHEMA),

    // Create and setup reader role permissions.
    readerRolePermissions(databaseId, FIREBASE_SUPER_USER, DEFAULT_SCHEMA),

    // Grant firebaseowner role to the current IAM user.
    `GRANT "${firebaseowner(databaseId)}" TO "${user}"`,
    // Grant firebaswriter to the FDC P4SA user
    `GRANT "${firebasewriter(databaseId)}" TO "${fdcP4SAUser}"`,
  );

  return executeSqlCmdsAsSuperUser(options, instanceId, databaseId, sqlRoleSetupCmds, silent);
}

export enum SchemaSetupStatus {
  NotSetup = 'not-setup',
  GreenField = 'greenfield',
  BrownField = 'brownfield',
  NotFound = 'not-found' // Schema not found
}

export enum UserAccessLevel {
  OWNER = 'owner',
  WRITER = 'writer',
  READER = 'reader',
  NONE = 'none'
}

export async function getTablesMetaData(instanceId: string, databaseId: string, schema: string, options: Options): Promise<TableMetaData[]> {
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
    throw new FirebaseError(`Failed To get tables metadata with error: ${e}`)
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
export async function determineSchemaSetupStatus(instanceId: string, databaseId: string, schema: string, options: Options): Promise<{
  schemaOwner: string | undefined,
  setupStatus: SchemaSetupStatus
}> {
  const checkSchemaExists = await executeSqlCmdsAsSuperUser(
    options, 
    instanceId, 
    databaseId,
    /** cmd=*/ [`SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '${schema}')
        THEN TRUE
        ELSE FALSE
    END AS schema_exists,
    (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = '${schema}') AS schema_owner;`],
    /** silent=*/ true)
  
  if (!checkSchemaExists[0].rows[0].schema_exists) {
    return {
      schemaOwner: undefined,
      setupStatus: SchemaSetupStatus.NotFound
    }
  }

  const checkRoleExists = async (role: string): Promise<boolean> => {
    const cmd = [`SELECT to_regrole('"${role}"') IS NOT NULL;`]
    const result = await executeSqlCmdsAsIamUser(options, instanceId, databaseId, cmd, /** silent=*/ true)
    return result[0].rows[0]
  }
  // If owner exists -> greenfield
  if (await checkRoleExists(firebaseowner(databaseId, schema))) {
    return {
      schemaOwner: checkSchemaExists[0].rows[0].schema_owner,
      setupStatus: SchemaSetupStatus.GreenField
    }
  }
  // If writer exists -> brownfield
  if (await checkRoleExists(firebasewriter(databaseId, schema))) {
    return {
      schemaOwner: checkSchemaExists[0].rows[0].schema_owner,
      setupStatus: SchemaSetupStatus.BrownField
    }
  }
  
  return {
    schemaOwner: checkSchemaExists[0].rows[0].schema_owner,
    setupStatus: SchemaSetupStatus.NotSetup
  }
}

export async function setupBrownfieldAsGreenfield(
  instanceId: string,
  databaseId: string,
  options: Options,
  silent: boolean = false,
) {
  const schema = DEFAULT_SCHEMA
  // Step 0: Get current table owners
  const tables = await getTablesMetaData(instanceId, databaseId, DEFAULT_SCHEMA, options)
  const currentTablesOwners = [...new Set(tables.map(t => t.owner))]

  // Step 1: Run our usual setup which creates necessary roles, transfers schema ownership, and gives nessary grants
  await setupSQLPermissions(instanceId, databaseId, options, silent);

  // Step 2: Give the found owners writer permissions
  const grantPreviousOwnerWriter = currentTablesOwners.map(
    (owner) => `GRANT "${firebasewriter(databaseId, schema)}" TO "${owner}"`
  )
  await executeSqlCmdsAsSuperUser(options, instanceId, databaseId, grantPreviousOwnerWriter, silent);

  // Step 3: Transfer ownership from original owner to firebaseowner
  await alterSchemaTablesOwners(databaseId, firebaseowner(databaseId, schema), schema)
}


export async function setupBrownfieldSQL(
  instanceId: string,
  databaseId: string,
  options: Options,
  silent: boolean = false,
) {
  // Step 0: Get tables metadata
  const tables = await getTablesMetaData(instanceId, databaseId, DEFAULT_SCHEMA, options)
  const currentTablesOwners = [...new Set(tables.map(t => t.owner))]

  // Step 1: Grant firebasesuperuser access to the original owner
  const grants = currentTablesOwners.map((owner) => `GRANT ${owner} TO ${FIREBASE_SUPER_USER}`)
  await executeSqlCmdsAsSuperUser(options, instanceId, databaseId, grants, silent);

  // Step 2: Using firebasesuperuser, setup reader and writer permissions on existing tables and setup default permissions for future tables.
  const iamUser = (await getIAMUser(options)).user;
  const projectNumber = await needProjectNumber(options);
  const { user: fdcP4SAUser } = toDatabaseUser(
      getDataConnectP4SA(projectNumber),
  );
  const brownfieldSetupCmds = [
    // Create and setup writer role permissions.
    writerRolePermissions(databaseId, FIREBASE_SUPER_USER, DEFAULT_SCHEMA),

    // Create and setup reader role permissions.
    readerRolePermissions(databaseId, FIREBASE_SUPER_USER, DEFAULT_SCHEMA),

    // Grant firebasewriter role to the current IAM user.
    `GRANT "${firebasewriter(databaseId)}" TO "${iamUser}"`,
    // Grant firebaswriter to the FDC P4SA user
    `GRANT "${firebasewriter(databaseId)}" TO "${fdcP4SAUser}"`,
  ]
}