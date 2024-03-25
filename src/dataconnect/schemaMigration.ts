import * as clc from "colorette";
import { format } from "sql-formatter";

import { IncompatibleSqlSchemaError, Diff } from "./types";
import { upsertSchema } from "./client";
import { execute, setupIAMUser } from "../gcp/cloudsql/connect";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import { Schema } from "./types";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { REQUIRED_EXTENSIONS_COMMANDS } from "./provisionCloudSql";
import { needProjectId } from "../projectUtils";

const IMCOMPATIBLE_SCHEMA_ERROR_TYPESTRING =
  "type.googleapis.com/google.firebase.dataconnect.v1main.IncompatibleSqlSchemaError";

export async function diffSchema(schema: Schema): Promise<Diff[]> {
  const dbName = schema.primaryDatasource.postgresql?.database;
  const instanceName = schema.primaryDatasource.postgresql?.cloudSql.instance;
  if (!instanceName || !dbName) {
    throw new FirebaseError(`tried to diff schema but ${instanceName} was undefined`);
  }
  try {
    // TODO: Handle cases where error only comes back after validateOnly=false
    await upsertSchema(schema, /** validateOnly=*/ true);
  } catch (err: any) {
    const incompatible = getIncompatibleSchemaError(err);
    if (incompatible) {
      displaySchemaChanges(incompatible);
      return incompatible.diffs;
    }
    throw err;
  }
  logger.debug(`Schema was up to date for ${instanceName}:${dbName}`);
  return [];
}

export async function migrateSchema(options: Options, schema: Schema): Promise<Diff[]> {
  const projectId = needProjectId(options);
  const databaseId = schema.primaryDatasource.postgresql?.database;
  if (!databaseId) {
    throw new FirebaseError(
      "Schema is missing primaryDatasource.postgresql?.database, cannot migrate",
    );
  }
  const instanceId = schema.primaryDatasource.postgresql?.cloudSql.instance.split("/").pop();
  if (!instanceId) {
    throw new FirebaseError(`tried to migrate schema but ${instanceId} was undefined`);
  }
  const iamUser = await setupIAMUser(instanceId, databaseId, options);
  try {
    // TODO(b/330596914): Handle cases where error only comes back after validateOnly=false
    await upsertSchema(schema, /** validateOnly=*/ true);
  } catch (err: any) {
    const incompatible = getIncompatibleSchemaError(err);
    if (incompatible) {
      const choice = await promptForSchemaMigration(options, databaseId, incompatible);
      const commandsToExecute = incompatible.diffs
        .filter((d) => {
          switch (choice) {
            case "all":
              return true;
            case "safe":
              return !d.destructive;
            case "none":
              return false;
          }
        })
        .map((d) => d.sql);
      if (commandsToExecute.length) {
        await execute(
          [
            ...REQUIRED_EXTENSIONS_COMMANDS,
            ...commandsToExecute,
            `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" TO PUBLIC`,
          ],
          {
            projectId,
            instanceId,
            databaseId,
            username: iamUser,
          },
        );
        return incompatible.diffs;
      }
    }
    throw err;
  }
  logger.debug(`Schema was up to date for ${instanceId}:${databaseId}`);
  return [];
}

async function promptForSchemaMigration(
  options: Options,
  databaseName: string,
  err: IncompatibleSqlSchemaError,
): Promise<"none" | "safe" | "all"> {
  displaySchemaChanges(err);
  if (options.nonInteractive && !options.force && err.destructive) {
    logger.warn(
      "This schema migration includes potentially desturctive changes. If you'd like to execute it anyone, rerun this command with --force",
    );
    return "none";
  } else if (options.nonInteractive && (options.force || !err.destructive)) {
    return "all";
  }
  return await promptOnce({
    message: `Would you like to execute these changes against ${databaseName}?`,
    type: "list",
    choices: [
      { name: "Execute all changes (including destructive changes)", value: "all" },
      { name: "Execute only safe changes", value: "safe" },
      { name: "Abort changes", value: "none" },
    ],
  });
}

function displaySchemaChanges(error: IncompatibleSqlSchemaError) {
  const message =
    "Your new schema is incompatible with the schema of your CloudSQL database." +
    "The following SQL statements will migrate your database schema to match your new Dataconnect schema.\n" +
    error.diffs.map(toString).join("\n");
  logger.warn(message);
}

function toString(diff: Diff) {
  return `\/** ${diff.destructive ? clc.red("Destructive: ") : ""}${diff.description}*\/\n${format(diff.sql, { language: "postgresql" })}`;
}

function getIncompatibleSchemaError(err: any): IncompatibleSqlSchemaError | undefined {
  const original = err.context?.body.error;
  const details: any[] = original.details;
  const incompatibles = details.filter((d) => d["@type"] === IMCOMPATIBLE_SCHEMA_ERROR_TYPESTRING);
  // Should never get multiple incompatible schema errors
  return incompatibles[0];
}
