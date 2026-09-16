import { Command } from "../command";
import { Options } from "../options";
import { getProjectId } from "../projectUtils";
import { EmulatorHub } from "../emulator/hub";
import { pickOneService } from "../dataconnect/load";
import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { dataConnectLocalConnString } from "../api";
import { getProjectDefaultAccount } from "../auth";
import * as experiments from "../experiments";
import { FirebaseError } from "../error";
import { EmulatorHubClient } from "../emulator/hubClient";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { nativeSqlInferEnv, nativeSqlInferMode } from "../dataconnect/nativeSqlInfer";

export type SqlInferOptions = Options & {
  service?: string;
  connector?: string;
};

/**
 * Query the running emulator hub for active PostgreSQL connection string of the given service.
 */
export async function getRunningPostgresConnStr(
  projectId: string,
  serviceId: string,
): Promise<string | undefined> {
  const hubClient = new EmulatorHubClient(projectId);
  if (!hubClient.foundHub()) {
    return undefined;
  }
  try {
    const emus = await hubClient.getEmulators();
    if (!emus.dataconnect) {
      return undefined;
    }
    const client = new Client({
      urlPrefix: `http://${emus.dataconnect.host}:${emus.dataconnect.port}`,
      auth: false,
    });
    const res = await client.get<{ services: { serviceId: string; connectionString: string }[] }>(
      "emulator/info",
    );
    return res.body?.services?.find((s) => s.serviceId === serviceId)?.connectionString;
  } catch {
    return undefined;
  }
}

export const command = new Command("dataconnect:sql:infer")
  .description("infer GraphQL types from native SQL queries in your connectors")
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option("--connector <connectorId>", "optional connectorId to scope inference")
  .action(async (options: SqlInferOptions) => {
    // 1. Enforce hard gating rule
    experiments.assertEnabled("fdcnativesqlinfer", "use native SQL type inference");

    const projectId = getProjectId(options) || EmulatorHub.MISSING_PROJECT_PLACEHOLDER;
    const serviceInfo = await pickOneService(projectId, options.config, options.service);
    const serviceId = serviceInfo.dataConnectYaml.serviceId;
    const configDir = serviceInfo.sourceDirectory;

    // 2. Read explicit mode from firebase.json
    const mode = nativeSqlInferMode(options.config);
    if (!mode) {
      throw new FirebaseError(
        "Missing required configuration 'dataconnect.nativeSqlInferMode' in firebase.json. Set it to 'db' to enable native SQL type inference.",
      );
    }

    let connStr: string | undefined = dataConnectLocalConnString() || undefined;
    if (!connStr) {
      connStr = await getRunningPostgresConnStr(projectId, serviceId);
      if (connStr) {
        logger.info(
          `Using active database connection from running Data Connect emulator: ${connStr}`,
        );
      }
    }
    if (!connStr) {
      throw new FirebaseError(
        "Cannot run type inference in db mode without an active database connection. Start the Data Connect emulator in a separate terminal ('firebase emulators:start') or set the database connection string via FIREBASE_DATACONNECT_POSTGRESQL_STRING.",
      );
    }

    await DataConnectEmulator.sqlInfer({
      configDir,
      connectorId: options.connector,
      connectionString: connStr,
      account: getProjectDefaultAccount(options.projectRoot),
      extraEnv: nativeSqlInferEnv(options.config),
    });
  });
