import * as clc from "colorette";

import { Options } from "../../options";
import {
  firebaseowner,
  firebasewriter,
  firebasereader,
  ownerRolePermissions,
  writerRolePermissions,
  readerRolePermissions,
  defaultPermissions,
  CLOUDSQL_SUPER_USER,
  FIREBASE_SUPER_USER,
} from "./permissions";
import { iamUserIsCSQLAdmin } from "./cloudsqladmin";
import { setupIAMUsers } from "./connect";
import { logger } from "../../logger";
import { confirm } from "../../prompt";
import { FirebaseError } from "../../error";
import { needProjectNumber } from "../../projectUtils";
import { executeSqlCmdsAsIamUser, executeSqlCmdsAsSuperUser, getIAMUser } from "./connect";
import { concat } from "lodash";
import { getDataConnectP4SA, toDatabaseUser } from "./connect";
import * as utils from "../../utils";

export type TableMetadata = {
  name: string;
  owner: string;
};

export enum SchemaSetupStatus {
  NotSetup = "not-setup",
  GreenField = "greenfield",
  BrownField = "brownfield",
  NotFound = "not-found", // Schema not found
}

export type SchemaMetadata = {
  name: string;
  owner: string | null;
  tables: TableMetadata[];
  setupStatus: SchemaSetupStatus;
};

export const fdcSqlRoleMap = {
  owner: firebaseowner,
  writer: firebasewriter,
  reader: firebasereader,
};

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

// Sets up all FDC roles (owner, writer, and reader).
// Granting roles to users is done by the caller.
export async function setupSQLPermissions(
  instanceId: string,
  databaseId: string,
  schemaInfo: SchemaMetadata,
  options: Options,
  silent: boolean = false,
): Promise<SchemaSetupStatus.BrownField | SchemaSetupStatus.GreenField> {
  const logFn = silent
    ? logger.debug
    : (message: string) => {
        return utils.logLabeledBullet("dataconnect", message);
      };
  const schema = schemaInfo.name;
  // Step 0: Check current user can run setup and upsert IAM / P4SA users
  logFn(`Detected schema "${schema}" setup status is ${schemaInfo.setupStatus}. Running setup...`);

  const userIsCSQLAdmin = await iamUserIsCSQLAdmin(options);
  if (!userIsCSQLAdmin) {
    throw new FirebaseError(
      `Missing required IAM permission to setup SQL schemas. SQL schema setup requires 'roles/cloudsql.admin' or an equivalent role.`,
    );
  }
  await setupIAMUsers(instanceId, databaseId, options);

  let runGreenfieldSetup = false;
  if (schemaInfo.setupStatus === SchemaSetupStatus.GreenField) {
    runGreenfieldSetup = true;
    logFn(
      `Database ${databaseId} has already been setup as greenfield project. Rerunning setup to repair any missing permissions.`,
    );
  }

  if (schemaInfo.tables.length === 0) {
    runGreenfieldSetup = true;
    logFn(`Found no tables in schema "${schema}", assuming greenfield project.`);
  }

  // We need to setup the database
  if (runGreenfieldSetup) {
    const greenfieldSetupCmds = await greenFieldSchemaSetup(
      instanceId,
      databaseId,
      schema,
      options,
    );
    await executeSqlCmdsAsSuperUser(
      options,
      instanceId,
      databaseId,
      greenfieldSetupCmds,
      silent,
      /** transaction=*/ true,
    );

    logFn(clc.green("Database setup complete."));
    return SchemaSetupStatus.GreenField;
  }

  if (options.nonInteractive || options.force) {
    throw new FirebaseError(
      `Schema "${schema}" isn't set up and can only be set up in interactive mode.`,
    );
  }
  const currentTablesOwners = [...new Set(schemaInfo.tables.map((t) => t.owner))];
  logFn(
    `We found some existing object owners [${currentTablesOwners.join(", ")}] in your cloudsql "${schema}" schema.`,
  );

  const shouldSetupGreenfield = await confirm({
    message: clc.yellow(
      "Would you like FDC to handle SQL migrations for you moving forward?\n" +
        `This means we will transfer schema and tables ownership to ${firebaseowner(databaseId, schema)}\n` +
        "Note: your existing migration tools/roles may lose access.",
    ),
    default: false,
  });

  if (shouldSetupGreenfield) {
    await setupBrownfieldAsGreenfield(instanceId, databaseId, schemaInfo, options, silent);
    logger.info(clc.green("Database setup complete.")); // If we do set up, always at least show this line.
    logFn(
      clc.yellow(
        "IMPORTANT: please uncomment 'schemaValidation: \"COMPATIBLE\"' in your dataconnect.yaml file to avoid dropping any existing tables by mistake.",
      ),
    );
    return SchemaSetupStatus.GreenField;
  } else {
    logFn(
      clc.yellow(
        "Setting up database in brownfield mode.\n" +
          `Note: SQL migrations can't be done through ${clc.bold("firebase dataconnect:sql:migrate")} in this mode.`,
      ),
    );
    await brownfieldSqlSetup(instanceId, databaseId, schemaInfo, options, silent);
    logFn(clc.green("Brownfield database setup complete."));
    return SchemaSetupStatus.BrownField;
  }
}

export async function greenFieldSchemaSetup(
  instanceId: string,
  databaseId: string,
  schema: string,
  options: Options,
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

  return sqlRoleSetupCmds;
}

export async function getSchemaMetadata(
  instanceId: string,
  databaseId: string,
  schema: string,
  options: Options,
): Promise<SchemaMetadata> {
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
  const schemaOwner = checkSchemaExists[0].rows[0].pg_get_userbyid;

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
    const cmd = [`SELECT to_regrole('"${role}"') IS NOT NULL AS exists;`];
    const result = await executeSqlCmdsAsIamUser(
      options,
      instanceId,
      databaseId,
      cmd,
      /** silent=*/ true,
    );
    return result[0].rows[0].exists;
  };

  let setupStatus;
  if (!(await checkRoleExists(firebasewriter(databaseId, schema)))) {
    setupStatus = SchemaSetupStatus.NotSetup;
  } else if (
    tables.every((table) => table.owner === firebaseowner(databaseId, schema)) &&
    schemaOwner === firebaseowner(databaseId, schema)
  ) {
    // If schema owner and all table owners are firebaseowner -> Greenfield
    setupStatus = SchemaSetupStatus.GreenField;
  } else {
    // We have determined firebase writer exists but schema/table owner isn't firebaseowner -> Brownfield
    setupStatus = SchemaSetupStatus.BrownField;
  }

  return {
    name: schema,
    owner: schemaOwner,
    setupStatus,
    tables: tables,
  };
}

function filterTableOwners(schemaInfo: SchemaMetadata, databaseId: string) {
  return [...new Set(schemaInfo.tables.map((t) => t.owner))].filter(
    (owner) =>
      owner !== CLOUDSQL_SUPER_USER && owner !== firebaseowner(databaseId, schemaInfo.name),
  );
}

export async function setupBrownfieldAsGreenfield(
  instanceId: string,
  databaseId: string,
  schemaInfo: SchemaMetadata,
  options: Options,
  silent: boolean = false,
) {
  const schema = schemaInfo.name;

  const firebaseOwnerRole = firebaseowner(databaseId, schema);
  const uniqueTablesOwners = filterTableOwners(schemaInfo, databaseId);

  // Grant roles to firebase superuser to avoid missing permissions on tables
  const grantOwnersToSuperuserCmds = uniqueTablesOwners.map(
    (owner) => `GRANT "${owner}" TO "${FIREBASE_SUPER_USER}"`,
  );
  const revokeOwnersFromSuperuserCmds = uniqueTablesOwners.map(
    (owner) => `REVOKE "${owner}" FROM "${FIREBASE_SUPER_USER}"`,
  );

  // Step 1: Our usual setup which creates necessary roles, transfers schema ownership, and gives nessary grants.
  const greenfieldSetupCmds = await greenFieldSchemaSetup(instanceId, databaseId, schema, options);

  // Step 2: Grant non firebase owners the writer role before changing the table owners.
  const grantCmds = uniqueTablesOwners.map(
    (owner) => `GRANT "${firebasewriter(databaseId, schema)}" TO "${owner}"`,
  );

  // Step 3: Alter table owners permissions
  const alterTableCmds = schemaInfo.tables.map(
    (table) => `ALTER TABLE "${schema}"."${table.name}" OWNER TO "${firebaseOwnerRole}";`,
  );

  const setupCmds = [
    ...grantOwnersToSuperuserCmds,
    ...greenfieldSetupCmds,
    ...grantCmds,
    ...alterTableCmds,
    ...revokeOwnersFromSuperuserCmds,
  ];

  // Run sql commands
  await executeSqlCmdsAsSuperUser(
    options,
    instanceId,
    databaseId,
    setupCmds,
    silent,
    /** transaction */ true,
  );
}

export async function brownfieldSqlSetup(
  instanceId: string,
  databaseId: string,
  schemaInfo: SchemaMetadata,
  options: Options,
  silent: boolean = false,
) {
  const schema = schemaInfo.name;

  // Step 1: Grant firebasesuperuser access to the original owner
  const uniqueTablesOwners = filterTableOwners(schemaInfo, databaseId);
  const grantOwnersToFirebasesuperuser = uniqueTablesOwners.map(
    (owner) => `GRANT "${owner}" TO "${FIREBASE_SUPER_USER}"`,
  );
  const revokeOwnersFromFirebasesuperuser = uniqueTablesOwners.map(
    (owner) => `REVOKE "${owner}" FROM "${FIREBASE_SUPER_USER}"`,
  );

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
    ...firebaseDefaultPermissions,

    // Execute revokes to avoid builtin user becoming IAM role
    ...revokeOwnersFromFirebasesuperuser,
  ];

  await executeSqlCmdsAsSuperUser(
    options,
    instanceId,
    databaseId,
    brownfieldSetupCmds,
    silent,
    /** transaction=*/ true,
  );
}
