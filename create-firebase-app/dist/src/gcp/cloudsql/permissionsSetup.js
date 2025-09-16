"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantRoleTo = exports.brownfieldSqlSetup = exports.setupBrownfieldAsGreenfield = exports.getSchemaMetadata = exports.greenFieldSchemaSetup = exports.setupSQLPermissions = exports.checkSQLRoleIsGranted = exports.fdcSqlRoleMap = exports.SchemaSetupStatus = void 0;
const clc = require("colorette");
const permissions_1 = require("./permissions");
const cloudsqladmin_1 = require("./cloudsqladmin");
const logger_1 = require("../../logger");
const prompt_1 = require("../../prompt");
const error_1 = require("../../error");
const projectUtils_1 = require("../../projectUtils");
const connect_1 = require("./connect");
const lodash_1 = require("lodash");
const connect_2 = require("./connect");
const utils = require("../../utils");
const cloudSqlAdminClient = require("./cloudsqladmin");
var SchemaSetupStatus;
(function (SchemaSetupStatus) {
    SchemaSetupStatus["NotSetup"] = "not-setup";
    SchemaSetupStatus["GreenField"] = "greenfield";
    SchemaSetupStatus["BrownField"] = "brownfield";
    SchemaSetupStatus["NotFound"] = "not-found";
})(SchemaSetupStatus = exports.SchemaSetupStatus || (exports.SchemaSetupStatus = {}));
exports.fdcSqlRoleMap = {
    owner: permissions_1.firebaseowner,
    writer: permissions_1.firebasewriter,
    reader: permissions_1.firebasereader,
};
// Returns true if "grantedRole" is granted to "granteeRole" and false otherwise.
// Throw an error if commands fails due to another reason like connection issues.
async function checkSQLRoleIsGranted(options, instanceId, databaseId, grantedRole, granteeRole) {
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
        await (0, connect_1.executeSqlCmdsAsIamUser)(options, instanceId, databaseId, [checkCmd], /** silent=*/ true);
        return true;
    }
    catch (e) {
        // We only return false after we confirm the error is indeed because the role isn't granted.
        // Otherwise we propagate the error.
        if (e instanceof error_1.FirebaseError && e.message.includes("not granted to role")) {
            return false;
        }
        logger_1.logger.error(`Role Check Failed: ${e}`);
        throw e;
    }
}
exports.checkSQLRoleIsGranted = checkSQLRoleIsGranted;
// Sets up all FDC roles (owner, writer, and reader).
// Granting roles to users is done by the caller.
async function setupSQLPermissions(instanceId, databaseId, schemaInfo, options, silent = false) {
    const logFn = silent
        ? logger_1.logger.debug
        : (message) => {
            return utils.logLabeledBullet("dataconnect", message);
        };
    const schema = schemaInfo.name;
    // Step 0: Check current user can run setup and upsert IAM / P4SA users
    logFn(`Detected schema "${schema}" setup status is ${schemaInfo.setupStatus}. Running setup...`);
    const userIsCSQLAdmin = await (0, cloudsqladmin_1.iamUserIsCSQLAdmin)(options);
    if (!userIsCSQLAdmin) {
        throw new error_1.FirebaseError(`Missing required IAM permission to setup SQL schemas. SQL schema setup requires 'roles/cloudsql.admin' or an equivalent role.`);
    }
    let runGreenfieldSetup = false;
    if (schemaInfo.setupStatus === SchemaSetupStatus.GreenField) {
        runGreenfieldSetup = true;
        logFn(`Database ${databaseId} has already been setup as greenfield project. Rerunning setup to repair any missing permissions.`);
    }
    if (schemaInfo.tables.length === 0) {
        runGreenfieldSetup = true;
        logFn(`Found no tables in schema "${schema}", assuming greenfield project.`);
    }
    // We need to setup the database
    if (runGreenfieldSetup) {
        const greenfieldSetupCmds = await greenFieldSchemaSetup(instanceId, databaseId, schema, options);
        await (0, connect_1.executeSqlCmdsAsSuperUser)(options, instanceId, databaseId, greenfieldSetupCmds, silent, 
        /** transaction=*/ true);
        logFn(clc.green("Database setup complete."));
        return SchemaSetupStatus.GreenField;
    }
    if (options.nonInteractive || options.force) {
        throw new error_1.FirebaseError(`Schema "${schema}" isn't set up and can only be set up in interactive mode.`);
    }
    const currentTablesOwners = [...new Set(schemaInfo.tables.map((t) => t.owner))];
    logFn(`We found some existing object owners [${currentTablesOwners.join(", ")}] in your cloudsql "${schema}" schema.`);
    const shouldSetupGreenfield = await (0, prompt_1.confirm)({
        message: clc.yellow("Would you like FDC to handle SQL migrations for you moving forward?\n" +
            `This means we will transfer schema and tables ownership to ${(0, permissions_1.firebaseowner)(databaseId, schema)}\n` +
            "Note: your existing migration tools/roles may lose access."),
        default: false,
    });
    if (shouldSetupGreenfield) {
        await setupBrownfieldAsGreenfield(instanceId, databaseId, schemaInfo, options, silent);
        logger_1.logger.info(clc.green("Database setup complete.")); // If we do set up, always at least show this line.
        logFn(clc.yellow("IMPORTANT: please uncomment 'schemaValidation: \"COMPATIBLE\"' in your dataconnect.yaml file to avoid dropping any existing tables by mistake."));
        return SchemaSetupStatus.GreenField;
    }
    else {
        logFn(clc.yellow("Setting up database in brownfield mode.\n" +
            `Note: SQL migrations can't be done through ${clc.bold("firebase dataconnect:sql:migrate")} in this mode.`));
        await brownfieldSqlSetup(instanceId, databaseId, schemaInfo, options, silent);
        logFn(clc.green("Brownfield database setup complete."));
        return SchemaSetupStatus.BrownField;
    }
}
exports.setupSQLPermissions = setupSQLPermissions;
async function greenFieldSchemaSetup(instanceId, databaseId, schema, options) {
    // Detect the minimal necessary revokes to avoid errors for users who used the old sql permissions setup.
    const revokes = [];
    if (await checkSQLRoleIsGranted(options, instanceId, databaseId, "cloudsqlsuperuser", (0, permissions_1.firebaseowner)(databaseId))) {
        logger_1.logger.warn("Detected cloudsqlsuperuser was previously given to firebase owner, revoking to improve database security.");
        revokes.push(`REVOKE "cloudsqlsuperuser" FROM "${(0, permissions_1.firebaseowner)(databaseId)}"`);
    }
    const user = (await (0, connect_1.getIAMUser)(options)).user;
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    const { user: fdcP4SAUser } = (0, connect_2.toDatabaseUser)((0, connect_2.getDataConnectP4SA)(projectNumber));
    const sqlRoleSetupCmds = (0, lodash_1.concat)(
    // For backward compatibality we sometimes need to revoke some roles.
    revokes, 
    // We shoud make sure schema exists since this setup runs prior to executing the diffs.
    [`CREATE SCHEMA IF NOT EXISTS "${schema}"`], 
    // Create and setup the owner role permissions.
    (0, permissions_1.ownerRolePermissions)(databaseId, permissions_1.FIREBASE_SUPER_USER, schema), 
    // Create and setup writer role permissions.
    (0, permissions_1.writerRolePermissions)(databaseId, permissions_1.FIREBASE_SUPER_USER, schema), 
    // Create and setup reader role permissions.
    (0, permissions_1.readerRolePermissions)(databaseId, permissions_1.FIREBASE_SUPER_USER, schema), 
    // Grant firebaseowner role to the current IAM user.
    `GRANT "${(0, permissions_1.firebaseowner)(databaseId, schema)}" TO "${user}"`, 
    // Grant firebaswriter to the FDC P4SA user
    `GRANT "${(0, permissions_1.firebasewriter)(databaseId, schema)}" TO "${fdcP4SAUser}"`, (0, permissions_1.defaultPermissions)(databaseId, schema, (0, permissions_1.firebaseowner)(databaseId, schema)));
    return sqlRoleSetupCmds;
}
exports.greenFieldSchemaSetup = greenFieldSchemaSetup;
async function getSchemaMetadata(instanceId, databaseId, schema, options) {
    // Check if schema exists
    const checkSchemaExists = await (0, connect_1.executeSqlCmdsAsIamUser)(options, instanceId, databaseId, 
    /** cmd=*/ [
        `SELECT pg_get_userbyid(nspowner) 
          FROM pg_namespace 
          WHERE nspname = '${schema}';`,
    ], 
    /** silent=*/ true);
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
    const res = await (0, connect_1.executeSqlCmdsAsIamUser)(options, instanceId, databaseId, [cmd], 
    /** silent=*/ true);
    const tables = res[0].rows.map((row) => {
        return {
            name: row.tablename,
            owner: row.tableowner,
        };
    });
    // If firebase writer role doesn't exist -> Schema not setup
    const checkRoleExists = async (role) => {
        const cmd = [`SELECT to_regrole('"${role}"') IS NOT NULL AS exists;`];
        const result = await (0, connect_1.executeSqlCmdsAsIamUser)(options, instanceId, databaseId, cmd, 
        /** silent=*/ true);
        return result[0].rows[0].exists;
    };
    let setupStatus;
    if (!(await checkRoleExists((0, permissions_1.firebasewriter)(databaseId, schema)))) {
        setupStatus = SchemaSetupStatus.NotSetup;
    }
    else if (tables.every((table) => table.owner === (0, permissions_1.firebaseowner)(databaseId, schema)) &&
        schemaOwner === (0, permissions_1.firebaseowner)(databaseId, schema)) {
        // If schema owner and all table owners are firebaseowner -> Greenfield
        setupStatus = SchemaSetupStatus.GreenField;
    }
    else {
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
exports.getSchemaMetadata = getSchemaMetadata;
function filterTableOwners(schemaInfo, databaseId) {
    return [...new Set(schemaInfo.tables.map((t) => t.owner))].filter((owner) => owner !== permissions_1.CLOUDSQL_SUPER_USER && owner !== (0, permissions_1.firebaseowner)(databaseId, schemaInfo.name));
}
async function setupBrownfieldAsGreenfield(instanceId, databaseId, schemaInfo, options, silent = false) {
    const schema = schemaInfo.name;
    const firebaseOwnerRole = (0, permissions_1.firebaseowner)(databaseId, schema);
    const uniqueTablesOwners = filterTableOwners(schemaInfo, databaseId);
    // Grant roles to firebase superuser to avoid missing permissions on tables
    const grantOwnersToSuperuserCmds = uniqueTablesOwners.map((owner) => `GRANT "${owner}" TO "${permissions_1.FIREBASE_SUPER_USER}"`);
    const revokeOwnersFromSuperuserCmds = uniqueTablesOwners.map((owner) => `REVOKE "${owner}" FROM "${permissions_1.FIREBASE_SUPER_USER}"`);
    // Step 1: Our usual setup which creates necessary roles, transfers schema ownership, and gives nessary grants.
    const greenfieldSetupCmds = await greenFieldSchemaSetup(instanceId, databaseId, schema, options);
    // Step 2: Grant non firebase owners the writer role before changing the table owners.
    const grantCmds = uniqueTablesOwners.map((owner) => `GRANT "${(0, permissions_1.firebasewriter)(databaseId, schema)}" TO "${owner}"`);
    // Step 3: Alter table owners permissions
    const alterTableCmds = schemaInfo.tables.map((table) => `ALTER TABLE "${schema}"."${table.name}" OWNER TO "${firebaseOwnerRole}";`);
    const setupCmds = [
        ...grantOwnersToSuperuserCmds,
        ...greenfieldSetupCmds,
        ...grantCmds,
        ...alterTableCmds,
        ...revokeOwnersFromSuperuserCmds,
    ];
    // Run sql commands
    await (0, connect_1.executeSqlCmdsAsSuperUser)(options, instanceId, databaseId, setupCmds, silent, 
    /** transaction */ true);
}
exports.setupBrownfieldAsGreenfield = setupBrownfieldAsGreenfield;
async function brownfieldSqlSetup(instanceId, databaseId, schemaInfo, options, silent = false) {
    const schema = schemaInfo.name;
    // Step 1: Grant firebasesuperuser access to the original owner
    const uniqueTablesOwners = filterTableOwners(schemaInfo, databaseId);
    const grantOwnersToFirebasesuperuser = uniqueTablesOwners.map((owner) => `GRANT "${owner}" TO "${permissions_1.FIREBASE_SUPER_USER}"`);
    const revokeOwnersFromFirebasesuperuser = uniqueTablesOwners.map((owner) => `REVOKE "${owner}" FROM "${permissions_1.FIREBASE_SUPER_USER}"`);
    // Step 2: Using firebasesuperuser, setup reader and writer permissions on existing tables and setup default permissions for future tables.
    const iamUser = (await (0, connect_1.getIAMUser)(options)).user;
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    const { user: fdcP4SAUser } = (0, connect_2.toDatabaseUser)((0, connect_2.getDataConnectP4SA)(projectNumber));
    // Step 3: Grant firebase reader and writer roles access to any new tables created by found owner.
    const firebaseDefaultPermissions = uniqueTablesOwners.flatMap((owner) => (0, permissions_1.defaultPermissions)(databaseId, schema, owner));
    // Batch execute the previous steps commands
    const brownfieldSetupCmds = [
        // Firebase superuser grants
        ...grantOwnersToFirebasesuperuser,
        // Create and setup writer role permissions.
        ...(0, permissions_1.writerRolePermissions)(databaseId, permissions_1.FIREBASE_SUPER_USER, schema),
        // Create and setup reader role permissions.
        ...(0, permissions_1.readerRolePermissions)(databaseId, permissions_1.FIREBASE_SUPER_USER, schema),
        // Grant firebasewriter role to the current IAM user.
        `GRANT "${(0, permissions_1.firebasewriter)(databaseId, schema)}" TO "${iamUser}"`,
        // Grant firebaswriter to the FDC P4SA user
        `GRANT "${(0, permissions_1.firebasewriter)(databaseId, schema)}" TO "${fdcP4SAUser}"`,
        // Insures firebase roles have access to future tables
        ...firebaseDefaultPermissions,
        // Execute revokes to avoid builtin user becoming IAM role
        ...revokeOwnersFromFirebasesuperuser,
    ];
    await (0, connect_1.executeSqlCmdsAsSuperUser)(options, instanceId, databaseId, brownfieldSetupCmds, silent, 
    /** transaction=*/ true);
}
exports.brownfieldSqlSetup = brownfieldSqlSetup;
async function grantRoleTo(options, instanceId, databaseId, role, email) {
    // Upsert new user account into the database.
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const { user, mode } = (0, connect_2.toDatabaseUser)(email);
    await cloudSqlAdminClient.createUser(projectId, instanceId, mode, user);
    const fdcSqlRole = exports.fdcSqlRoleMap[role](databaseId);
    await (0, connect_1.executeSqlCmdsAsSuperUser)(options, instanceId, databaseId, 
    /** cmds= */ [`GRANT "${fdcSqlRole}" TO "${user}"`], 
    /** silent= */ false);
}
exports.grantRoleTo = grantRoleTo;
