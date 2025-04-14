import * as pg from "pg";
import * as clc from "colorette";
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";

import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickService } from "../dataconnect/fileUtils";
import { getIdentifiers } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { getIAMUser } from "../gcp/cloudsql/connect";
import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import { prompt, Question } from "../prompt";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { FBToolsAuthClient } from "../gcp/cloudsql/fbToolsAuthClient";
import { confirmDangerousQuery, interactiveExecuteQuery } from "../gcp/cloudsql/interactive";

// Not a comprehensive list, used for keyword coloring.
const sqlKeywords = [
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "UPDATE",
  "DELETE",
  "JOIN",
  "GROUP",
  "ORDER",
  "LIMIT",
  "GRANT",
  "CREATE",
  "DROP",
];

async function promptForQuery(): Promise<string> {
  let query = "";
  let line = "";

  do {
    const question: Question = {
      type: "input",
      name: "line",
      message: query ? "> " : "Enter your SQL query (or '.exit'):",
      transformer: (input: string) => {
        // Highlight SQL keywords
        return input
          .split(" ")
          .map((word) => (sqlKeywords.includes(word.toUpperCase()) ? clc.cyan(word) : word))
          .join(" ");
      },
    };

    ({ line } = await prompt({ nonInteractive: false }, [question]));
    line = line.trimEnd();

    if (line.toLowerCase() === ".exit") {
      return ".exit";
    }

    query += (query ? "\n" : "") + line;
  } while (line !== "" && !query.endsWith(";"));
  return query;
}

async function mainShellLoop(conn: pg.PoolClient) {
  while (true) {
    const query = await promptForQuery();
    if (query.toLowerCase() === ".exit") {
      break;
    }

    if (query === "") {
      continue;
    }

    if (await confirmDangerousQuery(query)) {
      await interactiveExecuteQuery(query, conn);
    } else {
      logger.info(clc.yellow("Query cancelled."));
    }
  }
}

export const command = new Command("dataconnect:sql:shell [serviceId]")
  .description(
    "start a shell connected directly to your Data Connect service's linked CloudSQL instance",
  )
  .before(requirePermissions, ["firebasedataconnect.services.list", "cloudsql.instances.connect"])
  .before(requireAuth)
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);
    const { instanceId, databaseId } = getIdentifiers(serviceInfo.schema);
    const { user: username } = await getIAMUser(options);
    const instance = await cloudSqlAdminClient.getInstance(projectId, instanceId);

    // Setup the connection
    const connectionName = instance.connectionName;
    if (!connectionName) {
      throw new FirebaseError(
        `Could not get instance connection string for ${options.instanceId}:${options.databaseId}`,
      );
    }
    const connector: Connector = new Connector({
      auth: new FBToolsAuthClient(),
    });
    const clientOpts = await connector.getOptions({
      instanceConnectionName: connectionName,
      ipType: IpAddressTypes.PUBLIC,
      authType: AuthTypes.IAM,
    });
    const pool: pg.Pool = new pg.Pool({
      ...clientOpts,
      user: username,
      database: databaseId,
    });
    const conn: pg.PoolClient = await pool.connect();

    logger.info(`Logged in as ${username}`);
    logger.info(clc.cyan("Welcome to Data Connect Cloud SQL Shell"));
    logger.info(
      clc.gray(
        "Type your your SQL query or '.exit' to quit, queries should end with ';' or add empty line to execute.",
      ),
    );

    // Start accepting queries
    await mainShellLoop(conn);

    // Cleanup after exit
    logger.info(clc.yellow("Exiting shell..."));
    conn.release();
    await pool.end();
    connector.close();

    return { projectId, serviceId };
  });
