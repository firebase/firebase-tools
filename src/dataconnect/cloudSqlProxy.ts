import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";

import { FirebaseError } from "../error";
import { Options } from "../options";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import { FBToolsAuthClient } from "../gcp/cloudsql/fbToolsAuthClient";
import { getIAMUser } from "../gcp/cloudsql/connect";
import { getIdentifiers } from "./schemaMigration";
import { mainSchema, ServiceInfo } from "./types";

// Postgres clients derive the socket file name from the port, so the directory we hand to
// `host=` must contain a file with exactly this name.
const SOCKET_FILENAME = ".s.PGSQL.5432";

// The kernel's `sockaddr_un.sun_path` is 108 bytes including the NUL terminator. Stay well
// under it so that bind() fails loudly here instead of hanging inside the connector.
const MAX_SOCKET_PATH_BYTES = 100;

// `startLocalProxy` resolves when the listener is up but never rejects when it fails, so a
// listen error (EADDRINUSE / EACCES / EINVAL) would otherwise hang forever.
const PROXY_START_TIMEOUT_MS = 30_000;

/** A running Cloud SQL Auth Proxy listening on a local unix socket. */
export interface LocalProxy {
  connectionString: string;
  close: () => Promise<void>;
}

/**
 * Starts a local Cloud SQL Auth Proxy for the Cloud SQL instance linked to the given service.
 *
 * Everything the proxy needs is discovered from dataconnect.yaml plus the logged-in CLI
 * credential, so callers do not need to prompt for any connection details.
 *
 * @param options the CLI options, used to resolve the project and the IAM identity.
 * @param serviceInfo the loaded Data Connect service whose main schema names the instance.
 * @return the libpq keyword/value connection string and a disposer that tears the proxy down.
 */
export async function startLocalProxyForService(
  options: Options,
  serviceInfo: ServiceInfo,
): Promise<LocalProxy> {
  const projectId = needProjectId(options);
  const { instanceId, databaseId, schemaName } = getIdentifiers(mainSchema(serviceInfo.schemas));
  const { user: username } = await getIAMUser(options);

  const instance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
  const connectionName = instance.connectionName;
  if (!connectionName) {
    throw new FirebaseError(
      `Could not get the connection name for Cloud SQL instance ${instanceId}. ` +
        `The instance may still be provisioning - try again in a few minutes.`,
    );
  }

  const dbUser = await cloudSqlAdminClient.getUser(projectId, instanceId, username);
  let connector: Connector;
  switch (dbUser.type) {
    case "CLOUD_IAM_USER": {
      connector = new Connector({ auth: new FBToolsAuthClient() });
      break;
    }
    case "CLOUD_IAM_SERVICE_ACCOUNT": {
      // Currently, this only works with Application Default Credentials.
      // https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/issues/61 is an open
      // FR to add support for OAuth2 tokens.
      // TODO(fdc-team): Pass FBToolsAuthClient once cloud-sql-nodejs-connector supports OAuth2 token suppliers for service accounts (issue #61).
      connector = new Connector();
      break;
    }
    default: {
      // Cloud SQL doesn't return user.type for BUILT_IN users.
      throw new FirebaseError(
        `Cannot connect to Cloud SQL as built-in user ${username} - --cloud-sql only supports ` +
          `IAM database users. Run 'firebase dataconnect:sql:setup' to create an IAM user, or ` +
          `set FIREBASE_DATACONNECT_POSTGRESQL_STRING to connect with a password instead.`,
      );
    }
  }

  const dir = tmp.dirSync({ unsafeCleanup: true });
  const socketPath = path.join(dir.name, SOCKET_FILENAME);
  if (Buffer.byteLength(socketPath) >= MAX_SOCKET_PATH_BYTES) {
    dir.removeCallback();
    throw new FirebaseError(
      `Cannot start the Cloud SQL proxy: the socket path ${socketPath} is too long. ` +
        `Set TMPDIR to a shorter directory and try again.`,
    );
  }
  // Clear a socket left behind by a previous run that was SIGKILLed.
  fs.rmSync(socketPath, { force: true });

  const close = async (): Promise<void> => {
    try {
      connector.close();
    } catch (err) {
      logger.debug("[cloudsql] error closing connector during cleanup:", err);
    }
    try {
      dir.removeCallback();
    } catch (err) {
      logger.debug("[cloudsql] error removing socket directory during cleanup:", err);
    }
  };

  const onSignal = () => {
    void close();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const closeAndUnregister = async (): Promise<void> => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await close();
  };

  try {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      connector.startLocalProxy({
        instanceConnectionName: connectionName,
        ipType: instance.ipAddresses.some((ip) => ip.type === "PRIMARY")
          ? IpAddressTypes.PUBLIC
          : IpAddressTypes.PRIVATE,
        authType: AuthTypes.IAM,
        listenOptions: { path: socketPath },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new FirebaseError(
                `Timed out after ${PROXY_START_TIMEOUT_MS / 1000}s starting the Cloud SQL proxy ` +
                  `for ${connectionName}.`,
              ),
            ),
          PROXY_START_TIMEOUT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (err) {
    await closeAndUnregister();
    throw err;
  }

  return {
    // libpq keyword/value form, not a URL: IAM usernames contain '@' and '.'. Note that
    // keyword/value values are NOT percent-decoded, so `options` is written without spaces
    // (`-csearch_path=x`) to avoid any quoting or escaping.
    connectionString:
      `host=${dir.name} user=${username} dbname=${databaseId} sslmode=disable` +
      ` options=-csearch_path=${schemaName}`,
    close: closeAndUnregister,
  };
}
