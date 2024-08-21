import * as pg from "pg";
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";

import { requireAuth } from "../../requireAuth";
import { needProjectId } from "../../projectUtils";
import * as cloudSqlAdminClient from "./cloudsqladmin";
import { UserType } from "./types";
import * as utils from "../../utils";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { FBToolsAuthClient } from "./fbToolsAuthClient";
import { setupSQLPermissions, firebaseowner } from "./permissions";

export async function execute(
  sqlStatements: string[],
  opts: {
    projectId: string;
    instanceId: string;
    databaseId: string;
    username: string;
    password?: string;
    silent?: boolean;
  },
) {
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

  const conn = await pool.connect();
  logFn(`Logged in as ${opts.username}`);
  for (const s of sqlStatements) {
    logFn(`Executing: '${s}'`);
    try {
      await conn.query(s);
    } catch (err) {
      throw new FirebaseError(`Error executing ${err}`);
    }
  }

  conn.release();
  await pool.end();
  connector.close();
}

export async function executeSqlCmdsAsIamUser(
  options: Options,
  instanceId: string,
  databaseId: string,
  cmds: string[],
  silent = false,
): Promise<void> {
  const projectId = needProjectId(options);
  const { user: iamUser } = await getIAMUser(options);

  return await execute(cmds, {
    projectId,
    instanceId,
    databaseId,
    username: iamUser,
    silent: silent,
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

  return await execute([`SET ROLE = cloudsqlsuperuser`, ...cmds], {
    projectId,
    instanceId,
    databaseId,
    username: superuser,
    password: temporaryPassword,
    silent: silent,
  });
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

// setupIAMUser sets up the current user identity to connect to CloudSQL.
// Steps:
// 2. Create an IAM user for the current identity
// 3. Connect to the DB as the temporary user and run the necessary grants
// 4. Deletes the temporary user
export async function setupIAMUser(
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

  // 2. Setup FDC required SQL roles and permissions.
  await setupSQLPermissions(instanceId, databaseId, options, true);

  // 3. Grant firebaseowner role to the IAM user.
  const grants = [`GRANT "${firebaseowner(databaseId)}" TO "${user}"`];

  await executeSqlCmdsAsSuperUser(options, instanceId, databaseId, grants, true);
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
