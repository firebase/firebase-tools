import * as pg from "pg";
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";

import { requireAuth } from "../../requireAuth";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import { dataconnectP4SADomain } from "../../api";
import * as cloudSqlAdminClient from "./cloudsqladmin";
import { UserType } from "./types";
import * as utils from "../../utils";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { FBToolsAuthClient } from "./fbToolsAuthClient";

export async function execute(
  sqlStatements: string[],
  opts: {
    projectId: string;
    instanceId: string;
    databaseId: string;
    username: string;
    password?: string;
    silent?: boolean;
    transaction?: boolean;
  },
): Promise<pg.QueryResult[]> {
  const logFn = opts.silent ? logger.debug : logger.info;
  const instance = await cloudSqlAdminClient.getInstance(opts.projectId, opts.instanceId);
  const user = await cloudSqlAdminClient.getUser(opts.projectId, opts.instanceId, opts.username);
  const connectionName = instance.connectionName;
  if (!connectionName) {
    throw new FirebaseError(
      `Could not get instance connection string for ${opts.instanceId}:${opts.databaseId}`,
    );
  }
  let connector: Connector;
  let pool: pg.Pool;
  switch (user.type) {
    case "CLOUD_IAM_USER": {
      connector = new Connector({
        auth: new FBToolsAuthClient(),
      });
      const clientOpts = await connector.getOptions({
        instanceConnectionName: connectionName,
        ipType: IpAddressTypes.PUBLIC,
        authType: AuthTypes.IAM,
      });
      pool = new pg.Pool({
        ...clientOpts,
        user: opts.username,
        database: opts.databaseId,
      });
      break;
    }
    case "CLOUD_IAM_SERVICE_ACCOUNT": {
      connector = new Connector();
      // Currently, this only works with Application Default credentials
      // https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/issues/61 is an open
      // FR to add support for OAuth2 tokens.
      const clientOpts = await connector.getOptions({
        instanceConnectionName: connectionName,
        ipType: IpAddressTypes.PUBLIC,
        authType: AuthTypes.IAM,
      });
      pool = new pg.Pool({
        ...clientOpts,
        user: opts.username,
        database: opts.databaseId,
      });
      break;
    }
    default: {
      // Cloud SQL doesn't return user.type for BUILT_IN users...
      if (!opts.password) {
        throw new FirebaseError(`Cannot connect as BUILT_IN user without a password.`);
      }
      connector = new Connector({
        auth: new FBToolsAuthClient(),
      });
      const clientOpts = await connector.getOptions({
        instanceConnectionName: connectionName,
        ipType: IpAddressTypes.PUBLIC,
      });
      pool = new pg.Pool({
        ...clientOpts,
        user: opts.username,
        password: opts.password,
        database: opts.databaseId,
      });
      break;
    }
  }

  const cleanUpFn = async () => {
    conn.release();
    await pool.end();
    connector.close();
  };

  const conn = await pool.connect();
  const results: pg.QueryResult[] = [];
  logFn(`Logged in as ${opts.username}`);
  if (opts.transaction) {
    sqlStatements.unshift("BEGIN;");
    sqlStatements.push("COMMIT;");
  }
  for (const s of sqlStatements) {
    logFn(`Executing: '${s}'`);
    try {
      results.push(await conn.query(s));
    } catch (err) {
      logFn(`Rolling back transaction due to error ${err}}`);
      await conn.query("ROLLBACK;");
      await cleanUpFn();
      throw new FirebaseError(`Error executing ${err}`);
    }
  }

  await cleanUpFn();
  return results;
}

export async function executeSqlCmdsAsIamUser(
  options: Options,
  instanceId: string,
  databaseId: string,
  cmds: string[],
  silent = false,
  transaction = false,
): Promise<pg.QueryResult[]> {
  const projectId = needProjectId(options);
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

// Note this will change the password of the builtin firebasesuperuser user on every invocation.
// The role is set to 'cloudsqlsuperuser' (not the builtin user) unless SET ROLE is explicitly
// set in the commands.
export async function executeSqlCmdsAsSuperUser(
  options: Options,
  instanceId: string,
  databaseId: string,
  cmds: string[],
  silent = false,
  transaction = false,
): Promise<pg.QueryResult[]> {
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

export function getDataConnectP4SA(projectNumber: string): string {
  return `service-${projectNumber}@${dataconnectP4SADomain()}`;
}

export async function getIAMUser(options: Options): Promise<{ user: string; mode: UserType }> {
  const account = await requireAuth(options);
  if (!account) {
    throw new FirebaseError(
      "No account to set up! Run `firebase login` or set Application Default Credentials",
    );
  }

  return toDatabaseUser(account);
}

// setupIAMUsers sets up the current user identity to connect to CloudSQL.
// Steps:
// 1. Create an IAM user for the current identity
// 2. Create an IAM user for FDC P4SA
export async function setupIAMUsers(
  instanceId: string,
  databaseId: string,
  options: Options,
): Promise<string> {
  // TODO: Is there a good way to short circuit this by checking if the IAM user exists and has the appropriate role first?
  const projectId = needProjectId(options);

  // 0. Get the current identity
  const { user, mode } = await getIAMUser(options);

  // 1. Create an IAM user for the current identity.
  await cloudSqlAdminClient.createUser(projectId, instanceId, mode, user);

  // 2. Create dataconnenct P4SA user in case it's not created.
  const projectNumber = await needProjectNumber(options);
  const { user: fdcP4SAUser, mode: fdcP4SAmode } = toDatabaseUser(
    getDataConnectP4SA(projectNumber),
  );
  await cloudSqlAdminClient.createUser(projectId, instanceId, fdcP4SAmode, fdcP4SAUser);

  return user;
}

// Converts a account name to the equivalent SQL user.
// - Postgres: https://cloud.google.com/sql/docs/postgres/iam-logins#log-in-with-automatic
//   - For user: it's full email address.
//   - For service account: it's email address without the .gserviceaccount.com domain suffix.
export function toDatabaseUser(account: string): { user: string; mode: UserType } {
  let mode: UserType = "CLOUD_IAM_USER";
  let user = account;
  if (account.endsWith(".gserviceaccount.com")) {
    user = account.replace(".gserviceaccount.com", "");
    mode = "CLOUD_IAM_SERVICE_ACCOUNT";
  }
  return { user, mode };
}
