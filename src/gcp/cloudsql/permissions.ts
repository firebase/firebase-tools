import { Options } from "../../options";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import {
  executeSqlCmdsAsIamUser,
  executeSqlCmdsAsSuperUser,
  getIAMUser,
} from "./connect";
import { testIamPermissions } from "../iam";
import { logger } from "../../logger";
import { concat } from "lodash";
import { FirebaseError } from "../../error";
import { getDataConnectP4SA, toDatabaseUser } from "./connect";

export const DEFAULT_SCHEMA = "public";
export const FIREBASE_SUPER_USER = "firebasesuperuser";

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
};

export enum SchemaSetupStatus {
  NotSetup = "not-setup",
  GreenField = "greenfield",
  BrownField = "brownfield",
  NotFound = "not-found", // Schema not found
}

export type SchemaMetaData = {
  name: string;
  owner: string | null;
  tables: TableMetaData[];
  setupStatus: SchemaSetupStatus;
};

export enum UserAccessLevel {
  OWNER = "owner",
  WRITER = "writer",
  READER = "reader",
  NONE = "none",
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
  const firebaseOwnerRole = firebaseowner(databaseId, schema);
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
  const firebaseWriterRole = firebasewriter(databaseId, schema);
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
  ];
}

// The SQL permissions required for a role to read the FDC databases.
// Requires the firebase_owner_* role to be the owner of the schema for default permissions.
function readerRolePermissions(databaseId: string, superuser: string, schema: string): string[] {
  const firebaseReaderRole = firebasereader(databaseId, schema);
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
  ];
}

// Gives firebase reader and writer roles ability to see tables created by other owners in a given schema.
function defaultPermissions(databaseId: string, schema: string, ownerRole: string) {
  const firebaseWriterRole = firebasewriter(databaseId, schema);
  const firebaseReaderRole = firebasereader(databaseId, schema);
  return [
    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO "${firebaseWriterRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT USAGE ON SEQUENCES TO "${firebaseWriterRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT EXECUTE ON FUNCTIONS TO "${firebaseWriterRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT SELECT ON TABLES TO "${firebaseReaderRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT USAGE ON SEQUENCES TO "${firebaseReaderRole}";`,

    `ALTER DEFAULT PRIVILEGES
      FOR ROLE "${ownerRole}"
      IN SCHEMA "${schema}"
      GRANT EXECUTE ON FUNCTIONS TO "${firebaseReaderRole}";`,
  ];
}

export async function greenFieldSchemaSetup(
  instanceId: string,
  databaseId: string,
  schema: string,
  options: Options,
  silent: boolean = false,
) {
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

  const user = (await getIAMUser(options)).user;
  const projectNumber = await needProjectNumber(options);
  const { user: fdcP4SAUser } = toDatabaseUser(getDataConnectP4SA(projectNumber));

  const sqlRoleSetupCmds = concat(
    // For backward compatibality we sometimes need to revoke some roles.
    revokes,

    // We shoud make sure schema exists since this setup runs prior to executing the diffs.
    [`CREATE SCHEMA IF NOT EXISTS "${schema}"`],

    // Create and setup the owner role permissions.
    ownerRolePermissions(databaseId, FIREBASE_SUPER_USER, schema),

    // Create and setup writer role permissions.
    writerRolePermissions(databaseId, FIREBASE_SUPER_USER, schema),

    // Create and setup reader role permissions.
    readerRolePermissions(databaseId, FIREBASE_SUPER_USER, schema),

    // Grant firebaseowner role to the current IAM user.
    `GRANT "${firebaseowner(databaseId, schema)}" TO "${user}"`,
    // Grant firebaswriter to the FDC P4SA user
    `GRANT "${firebasewriter(databaseId, schema)}" TO "${fdcP4SAUser}"`,

    defaultPermissions(databaseId, schema, firebaseowner(databaseId, schema)),
  );

  await executeSqlCmdsAsSuperUser(options, instanceId, databaseId, sqlRoleSetupCmds, silent);
}

export async function getSchemaMetaData(
  instanceId: string,
  databaseId: string,
  schema: string,
  options: Options,
): Promise<SchemaMetaData> {
  // Check if schema exists
  const checkSchemaExists = await executeSqlCmdsAsIamUser(
    options,
    instanceId,
    databaseId,
    /** cmd=*/ [
      `SELECT pg_get_userbyid(nspowner) 
        FROM pg_namespace 
        WHERE nspname = '${schema}';`,
    ],
    /** silent=*/ true,
  );
  if (!checkSchemaExists[0].rows[0]) {
    return {
      name: schema,
      owner: null,
      setupStatus: SchemaSetupStatus.NotFound,
      tables: [],
    };
  }
  const schemaOwner = checkSchemaExists[0].rows[0];
  console.log(`SCHEMA OWNER: ${schemaOwner}`);

  // Get schema tables
  const cmd = `SELECT tablename, tableowner FROM pg_tables WHERE schemaname='${schema}'`;
  const res = await executeSqlCmdsAsIamUser(
    options,
    instanceId,
    databaseId,
    [cmd],
    /** silent=*/ true,
  );
  const tables = res[0].rows.map((row) => {
    return {
      name: row.tablename,
      owner: row.tableowner,
    };
  });

  // If firebase writer role doesn't exist -> Schema not setup
  const checkRoleExists = async (role: string): Promise<boolean> => {
    const cmd = [`SELECT to_regrole('"${role}"') IS NOT NULL;`];
    const result = await executeSqlCmdsAsIamUser(
      options,
      instanceId,
      databaseId,
      cmd,
      /** silent=*/ true,
    );
    return result[0].rows[0];
  };
  if (!(await checkRoleExists(firebasewriter(databaseId, schema)))) {
    return {
      name: schema,
      owner: schemaOwner,
      setupStatus: SchemaSetupStatus.NotSetup,
      tables: tables,
    };
  }

  // If schema owner and all table owners are firebaseowner -> Greenfield
  const firebaseOwnerRole = firebaseowner(databaseId, schema);
  if (
    tables.every((table) => table.owner === firebaseOwnerRole) &&
    schemaOwner === firebaseOwnerRole
  ) {
    return {
      name: schema,
      owner: schemaOwner,
      setupStatus: SchemaSetupStatus.GreenField,
      tables: tables,
    };
  }

  // We have determined firebase writer exists but schema/table owner isn't firebaseowner -> Brownfield
  return {
    name: schema,
    owner: schemaOwner,
    setupStatus: SchemaSetupStatus.BrownField,
    tables: tables,
  };
}

export async function setupBrownfieldAsGreenfield(
  instanceId: string,
  databaseId: string,
  schemaInfo: SchemaMetaData,
  options: Options,
  silent: boolean = false,
) {
  const schema = schemaInfo.name;

  // Step 1: Run our usual setup which creates necessary roles, transfers schema ownership, and gives nessary grants.
  await greenFieldSchemaSetup(instanceId, databaseId, schema, options, silent);

  // Step 2: Grant non firebase owners the writer role before changing the table owners.
  const firebaseOwnerRole = firebaseowner(databaseId, schema);
  const nonFirebasetablesOwners = [...new Set(schemaInfo.tables.map((t) => t.owner))].filter(
    (owner) => owner !== firebaseOwnerRole,
  );
  const grantCmds = nonFirebasetablesOwners.map(
    (owner) => `GRANT "${firebasewriter(databaseId, schema)}" TO "${owner}"`,
  );

  // Step 3: Alter table owners permissions
  const alterTableCmds = schemaInfo.tables.map(
    (table) => `ALTER TABLE "${schema}"."${table.name}" OWNER TO "${firebaseOwnerRole}";`,
  );

  // Run sql commands
  await executeSqlCmdsAsSuperUser(
    options,
    instanceId,
    databaseId,
    [...grantCmds, ...alterTableCmds],
    silent,
  );
}

export async function brownfieldSqlSetup(
  instanceId: string,
  databaseId: string,
  schemaInfo: SchemaMetaData,
  options: Options,
  silent: boolean = false,
) {
  const schema = schemaInfo.name;

  // Step 1: Grant firebasesuperuser access to the original owner
  const uniqueTablesOwners = [...new Set(schemaInfo.tables.map((t) => t.owner))];
  const grantOwnersToFirebasesuperuser = uniqueTablesOwners.map((owner) => `GRANT ${owner} TO ${FIREBASE_SUPER_USER}`);

  // Step 2: Using firebasesuperuser, setup reader and writer permissions on existing tables and setup default permissions for future tables.
  const iamUser = (await getIAMUser(options)).user;
  const projectNumber = await needProjectNumber(options);
  const { user: fdcP4SAUser } = toDatabaseUser(getDataConnectP4SA(projectNumber));

  // Step 3: Grant firebase reader and writer roles access to any new tables created by found owner.
  const firebaseDefaultPermissions = uniqueTablesOwners.flatMap((owner) =>
    defaultPermissions(databaseId, schema, owner),
  );

  // Batch execute the previous steps commands
  const brownfieldSetupCmds = [
    // Firebase superuser grants
    ...grantOwnersToFirebasesuperuser,
    // Create and setup writer role permissions.
    ...writerRolePermissions(databaseId, FIREBASE_SUPER_USER, schema),

    // Create and setup reader role permissions.
    ...readerRolePermissions(databaseId, FIREBASE_SUPER_USER, schema),

    // Grant firebasewriter role to the current IAM user.
    `GRANT "${firebasewriter(databaseId, schema)}" TO "${iamUser}"`,
    // Grant firebaswriter to the FDC P4SA user
    `GRANT "${firebasewriter(databaseId, schema)}" TO "${fdcP4SAUser}"`,
    
    // Insures firebase roles have access to future tables
    ...firebaseDefaultPermissions
  ];
  // Add default Permissions to each owner
  
  await executeSqlCmdsAsSuperUser(options, instanceId, databaseId, brownfieldSetupCmds, silent);
}
