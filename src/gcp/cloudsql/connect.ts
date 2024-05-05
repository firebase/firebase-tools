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
      `Could not get instance conection string for ${opts.instanceId}:${opts.databaseId}`,
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
        max: 1,
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
        max: 1,
      });
      break;
    }
    default: {
      // cSQL doesn't return user.type for BUILT_IN users...
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
        max: 1,
      });
      break;
    }
  }

  for (const s of sqlStatements) {
    logFn(`Executing: '${s}' as ${opts.username}`);
    try {
      await pool.query(s);
    } catch (err) {
      throw new FirebaseError(`Error executing ${err}`);
    }
  }

  await pool.end();
  connector.close();
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
  const account = await requireAuth(options);
  if (!account) {
    throw new FirebaseError(
      "No account to set up! Run `firebase login` or set Application Default Credentials",
    );
  }
  // 1. Create a temporary builtin user
  const setupUser = "firebasesuperuser";
  const temporaryPassword = utils.generateId(20);
  await cloudSqlAdminClient.createUser(
    projectId,
    instanceId,
    "BUILT_IN",
    setupUser,
    temporaryPassword,
  );

  // 2. Create an IAM user for the current identity
  const { user, mode } = toDatabaseUser(account);
  await cloudSqlAdminClient.createUser(projectId, instanceId, mode, user);

  // 3. Connect to the DB as the temporary user and run the necessary grants
  // TODO: I think we're missing something here, sometimes backend can't see the tables.
  const grants = [
    `do
      $$
      begin
        if not exists (select FROM pg_catalog.pg_roles
          WHERE  rolname = '${firebaseowner(databaseId)}') then
          CREATE ROLE "${firebaseowner(databaseId)}" WITH ADMIN "${setupUser}";
        end if;
      end
      $$
      ;`,
    `GRANT ALL PRIVILEGES ON DATABASE "${databaseId}" TO "${firebaseowner(databaseId)}"`,
    `GRANT cloudsqlsuperuser TO "${firebaseowner(databaseId)}"`,
    `GRANT "${firebaseowner(databaseId)}" TO "${setupUser}"`,
    `GRANT "${firebaseowner(databaseId)}" TO "${user}"`,
    `ALTER SCHEMA public OWNER TO "${firebaseowner(databaseId)}"`,
    `GRANT USAGE ON SCHEMA "public" TO PUBLIC`,
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" TO PUBLIC`,
    `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "public" TO PUBLIC`,
  ];
  await execute(grants, {
    projectId,
    instanceId,
    databaseId,
    username: setupUser,
    password: temporaryPassword,
    silent: true,
  });
  return user;
}

export function firebaseowner(databaseId: string) {
  return `firebaseowner_${databaseId}_public`;
}

// Converts a account name to the equivalent SQL user.
// - Postgres: https://cloud.google.com/sql/docs/postgres/iam-logins#log-in-with-automatic
//   - For user: it's full email address.
//   - For service account: it's email address without the .gserviceaccount.com domain suffix.
function toDatabaseUser(account: string): { user: string; mode: UserType } {
  let mode: UserType = "CLOUD_IAM_USER";
  let user = account;
  if (account.endsWith(".gserviceaccount.com")) {
    user = account.replace(".gserviceaccount.com", "");
    mode = "CLOUD_IAM_SERVICE_ACCOUNT";
  }
  return { user, mode };
}
