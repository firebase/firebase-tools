"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDatabaseUser = exports.setupIAMUsers = exports.getIAMUser = exports.getDataConnectP4SA = exports.executeSqlCmdsAsSuperUser = exports.executeSqlCmdsAsIamUser = exports.execute = void 0;
const pg = require("pg");
const cloud_sql_connector_1 = require("@google-cloud/cloud-sql-connector");
const requireAuth_1 = require("../../requireAuth");
const projectUtils_1 = require("../../projectUtils");
const api_1 = require("../../api");
const cloudSqlAdminClient = require("./cloudsqladmin");
const utils = require("../../utils");
const logger_1 = require("../../logger");
const error_1 = require("../../error");
const fbToolsAuthClient_1 = require("./fbToolsAuthClient");
async function execute(sqlStatements, opts) {
    const logFn = opts.silent ? logger_1.logger.debug : logger_1.logger.info;
    const instance = await cloudSqlAdminClient.getInstance(opts.projectId, opts.instanceId);
    const user = await cloudSqlAdminClient.getUser(opts.projectId, opts.instanceId, opts.username);
    const connectionName = instance.connectionName;
    if (!connectionName) {
        throw new error_1.FirebaseError(`Could not get instance connection string for ${opts.instanceId}:${opts.databaseId}`);
    }
    let connector;
    let pool;
    switch (user.type) {
        case "CLOUD_IAM_USER": {
            connector = new cloud_sql_connector_1.Connector({
                auth: new fbToolsAuthClient_1.FBToolsAuthClient(),
            });
            const clientOpts = await connector.getOptions({
                instanceConnectionName: connectionName,
                ipType: cloud_sql_connector_1.IpAddressTypes.PUBLIC,
                authType: cloud_sql_connector_1.AuthTypes.IAM,
            });
            pool = new pg.Pool(Object.assign(Object.assign({}, clientOpts), { user: opts.username, database: opts.databaseId }));
            break;
        }
        case "CLOUD_IAM_SERVICE_ACCOUNT": {
            connector = new cloud_sql_connector_1.Connector();
            // Currently, this only works with Application Default credentials
            // https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/issues/61 is an open
            // FR to add support for OAuth2 tokens.
            const clientOpts = await connector.getOptions({
                instanceConnectionName: connectionName,
                ipType: cloud_sql_connector_1.IpAddressTypes.PUBLIC,
                authType: cloud_sql_connector_1.AuthTypes.IAM,
            });
            pool = new pg.Pool(Object.assign(Object.assign({}, clientOpts), { user: opts.username, database: opts.databaseId }));
            break;
        }
        default: {
            // Cloud SQL doesn't return user.type for BUILT_IN users...
            if (!opts.password) {
                throw new error_1.FirebaseError(`Cannot connect as BUILT_IN user without a password.`);
            }
            connector = new cloud_sql_connector_1.Connector({
                auth: new fbToolsAuthClient_1.FBToolsAuthClient(),
            });
            const clientOpts = await connector.getOptions({
                instanceConnectionName: connectionName,
                ipType: cloud_sql_connector_1.IpAddressTypes.PUBLIC,
            });
            pool = new pg.Pool(Object.assign(Object.assign({}, clientOpts), { user: opts.username, password: opts.password, database: opts.databaseId }));
            break;
        }
    }
    const cleanUpFn = async () => {
        conn.release();
        await pool.end();
        connector.close();
    };
    const conn = await pool.connect();
    const results = [];
    logFn(`Logged in as ${opts.username}`);
    if (opts.transaction) {
        sqlStatements.unshift("BEGIN;");
        sqlStatements.push("COMMIT;");
    }
    for (const s of sqlStatements) {
        logFn(`> ${s}`);
        try {
            results.push(await conn.query(s));
        }
        catch (err) {
            logFn(`Rolling back transaction due to error ${err}}`);
            await conn.query("ROLLBACK;");
            await cleanUpFn();
            throw new error_1.FirebaseError(`Error executing ${err}`);
        }
    }
    await cleanUpFn();
    logFn(``);
    return results;
}
exports.execute = execute;
async function executeSqlCmdsAsIamUser(options, instanceId, databaseId, cmds, silent = false, transaction = false) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const { user: iamUser } = await getIAMUser(options);
    return await execute(cmds, {
        projectId,
        instanceId,
        databaseId,
        username: iamUser,
        silent: silent,
        transaction: transaction,
    });
}
exports.executeSqlCmdsAsIamUser = executeSqlCmdsAsIamUser;
// Note this will change the password of the builtin firebasesuperuser user on every invocation.
// The role is set to 'cloudsqlsuperuser' (not the builtin user) unless SET ROLE is explicitly
// set in the commands.
async function executeSqlCmdsAsSuperUser(options, instanceId, databaseId, cmds, silent = false, transaction = false) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    // 1. Create a temporary builtin user
    const superuser = "firebasesuperuser";
    const temporaryPassword = utils.generatePassword(20);
    await cloudSqlAdminClient.createUser(projectId, instanceId, "BUILT_IN", superuser, temporaryPassword);
    return await execute([`SET ROLE = '${superuser}'`, ...cmds], {
        projectId,
        instanceId,
        databaseId,
        username: superuser,
        password: temporaryPassword,
        silent: silent,
        transaction: transaction,
    });
}
exports.executeSqlCmdsAsSuperUser = executeSqlCmdsAsSuperUser;
function getDataConnectP4SA(projectNumber) {
    return `service-${projectNumber}@${(0, api_1.dataconnectP4SADomain)()}`;
}
exports.getDataConnectP4SA = getDataConnectP4SA;
async function getIAMUser(options) {
    const account = await (0, requireAuth_1.requireAuth)(options);
    if (!account) {
        throw new error_1.FirebaseError("No account to set up! Run `firebase login` or set Application Default Credentials");
    }
    return toDatabaseUser(account);
}
exports.getIAMUser = getIAMUser;
// setupIAMUsers sets up the current user identity to connect to CloudSQL.
// Steps:
// 1. Create an IAM user for the current identity
// 2. Create an IAM user for FDC P4SA
async function setupIAMUsers(instanceId, options) {
    // TODO: Is there a good way to short circuit this by checking if the IAM user exists and has the appropriate role first?
    const projectId = (0, projectUtils_1.needProjectId)(options);
    // 0. Get the current identity
    const { user, mode } = await getIAMUser(options);
    // 1. Create an IAM user for the current identity.
    await cloudSqlAdminClient.createUser(projectId, instanceId, mode, user);
    // 2. Create dataconnenct P4SA user in case it's not created.
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    const { user: fdcP4SAUser, mode: fdcP4SAmode } = toDatabaseUser(getDataConnectP4SA(projectNumber));
    await cloudSqlAdminClient.createUser(projectId, instanceId, fdcP4SAmode, fdcP4SAUser);
    return user;
}
exports.setupIAMUsers = setupIAMUsers;
// Converts a account name to the equivalent SQL user.
// - Postgres: https://cloud.google.com/sql/docs/postgres/iam-logins#log-in-with-automatic
//   - For user: it's full email address.
//   - For service account: it's email address without the .gserviceaccount.com domain suffix.
function toDatabaseUser(account) {
    let mode = "CLOUD_IAM_USER";
    let user = account;
    if (account.endsWith(".gserviceaccount.com")) {
        user = account.replace(".gserviceaccount.com", "");
        mode = "CLOUD_IAM_SERVICE_ACCOUNT";
    }
    return { user, mode };
}
exports.toDatabaseUser = toDatabaseUser;
