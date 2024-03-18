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
) {
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
    console.log(`Executing: '${s}' as ${username}`);
    const { rows } = await pool.query(s);
    console.table(rows);
  }

  await pool.end();
  connector.close();
}

export async function executeAsIAMUser(
  connectionName: string,
  databaseId: string,
  username: string,
  sqlStatements: string[],
) {
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
  for (const s of sqlStatements) {
    console.log(`Executing: '${s}' as ${username}`);
    const { rows } = await pool.query(s);
    console.table(rows);
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
  let account = await requireAuth(options);
  if (!account) {
    throw new FirebaseError(
      "No account to set up! Run `firebase login` or set Application Default Credentials",
    );
  }
  // 1. Create a temporary builtin user
  const temporaryUsername = "dataconnect-setup";
  const temporaryPassword = utils.generateId(20);
  await cloudSqlAdminClient.createUser(
    projectId,
    instanceId,
    temporaryUsername,
    temporaryPassword,
    "BUILT_IN",
  );

  // 2. Create an IAM user for the current identity
  if (!account) {
    throw new FirebaseError(
      "No account to set up! Run `firebase login` or set Application Default Credentials",
    );
  }
  let mode: cloudSqlAdminClient.UserType = "CLOUD_IAM_USER";
  if (account.endsWith(".gserviceaccount.com")) {
    account = account.replace(".gserviceaccount.com", "");
    mode = "CLOUD_IAM_SERVICE_ACCOUNT";
  }
  await cloudSqlAdminClient.createUser(projectId, instanceId, account || "", "", mode);

  // 3. Connect to the DB as the temporary user and run the necessary grants
  const grants = [
    `GRANT ALL PRIVILEGES ON SCHEMA "public" TO PUBLIC`,
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" TO PUBLIC`, // TODO: not this
    // `ALTER ROLE "${account}" WITH ROLE CLOUDSQLSUPERUSER` // TODO: Instead, this (but with correct syntax)
  ];
  await executeAsBuiltInUser(
    connectionName,
    databaseId,
    temporaryUsername,
    temporaryPassword,
    grants,
  );

  // 4. Deletes the temporary user
  logger.debug(
    `successfully setup up ${mode} user for ${account} - cleaning up temporary setup user`,
  );
  await cloudSqlAdminClient.deleteUser(projectId, instanceId, temporaryUsername);
  return account;
}
