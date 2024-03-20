import * as pg from "pg";
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";

import { requireAuth } from "../../requireAuth";
import { needProjectId } from "../../projectUtils";
import * as cloudSqlAdminClient from "./cloudsqladmin";
import * as utils from "../../utils";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { Options } from "../../options";

export async function executeAsBuiltInUser(
  connectionName: string,
  databaseId: string,
  username: string,
  password: string,
  sqlStatements: string[],
  silent?: boolean,
) {
  const logFn = silent ? logger.debug : logger.info;
  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName: connectionName,
    ipType: IpAddressTypes.PUBLIC,
  });
  const pool = new pg.Pool({
    ...clientOpts,
    user: username,
    password,
    database: databaseId,
    max: 1,
  });
  for (const s of sqlStatements) {
    logFn(`Executing: '${s}' as ${username}`);
    try {
      await pool.query(s);
    } catch (err) {
      throw new FirebaseError(`Error executing ${err}`);
    }
  }

  await pool.end();
  connector.close();
}

export async function executeAsIAMUser(
  connectionName: string,
  databaseId: string,
  username: string,
  sqlStatements: string[],
  silent?: boolean,
) {
  const logFn = silent ? logger.debug : logger.info;
  const connector = new Connector();
  // Currently, this only works with Application Default credentials
  // https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/issues/61 is an open
  // FR to add support for OAuth2 tokens.
  const clientOpts = await connector.getOptions({
    instanceConnectionName: connectionName,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  });
  const pool = new pg.Pool({
    ...clientOpts,
    user: username,
    database: databaseId,
    max: 1,
  });
  // Always run as firebaseowner so that tables have the right owner.
  for (const s of [`SET ROLE '${firebaseowner(databaseId)}'`, ...sqlStatements]) {
    logFn(`Executing: '${s}' as ${username}`);
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
  connectionName: string,
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
    `GRANT "${firebaseowner(databaseId)}" TO "cli-test"`,
    `GRANT "${firebaseowner(databaseId)}" TO "${setupUser}"`,
    `GRANT "${firebaseowner(databaseId)}" TO "${user}"`,
    `ALTER SCHEMA public OWNER TO "${firebaseowner(databaseId)}"`,
    `GRANT USAGE ON SCHEMA "public" TO PUBLIC`,
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" TO PUBLIC`,
  ];
  await executeAsBuiltInUser(
    connectionName,
    databaseId,
    setupUser,
    temporaryPassword,
    grants,
    /** silent=*/ true,
  );
  return user;
}

function firebaseowner(databaseId: string) {
  return `firebaseowner_${databaseId}_public`;
}

// Converts a account name to the equivalent SQL user.
// - Postgres: https://cloud.google.com/sql/docs/postgres/iam-logins#log-in-with-automatic
//   - For user: it's full email address.
//   - For service account: it's email address without the .gserviceaccount.com domain suffix.
function toDatabaseUser(account: string): { user: string; mode: cloudSqlAdminClient.UserType } {
  let mode: cloudSqlAdminClient.UserType = "CLOUD_IAM_USER";
  let user = account;
  if (account.endsWith(".gserviceaccount.com")) {
    user = account.replace(".gserviceaccount.com", "");
    mode = "CLOUD_IAM_SERVICE_ACCOUNT";
  }
  return { user, mode };
}
