import * as clc from "colorette";
import { format } from "sql-formatter";

import { IncompatibleSqlSchemaError, Diff } from "./types";
import { upsertSchema } from "./client";
import { execute, firebaseowner, setupIAMUser } from "../gcp/cloudsql/connect";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import { Schema } from "./types";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { needProjectId } from "../projectUtils";
import { logLabeledWarning } from "../utils";

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

export async function migrateSchema(args: {
  options: Options;
  schema: Schema;
  allowNonInteractiveMigration: boolean;
  validateOnly: boolean;
}): Promise<Diff[]> {
  const { schema, validateOnly } = args;

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
  try {
    await upsertSchema(schema, validateOnly);
    logger.debug(`Database schema was up to date for ${instanceId}:${databaseId}`);
    return [];
  } catch (err: any) {
    const incompatible = getIncompatibleSchemaError(err);
    if (!incompatible) {
      // If we got a different type of error, throw it
      throw err;
    }
    // Try to migrate schema
    const diffs = await handleIncompatibleSchemaError({
      ...args,
      incompatibleSchemaError: incompatible,
      instanceId,
      databaseId,
    });
    // Then, try to upsert schema again. If there still is an error, just throw it now
    await upsertSchema(schema, validateOnly);
    return diffs;
  }
}

async function handleIncompatibleSchemaError(args: {
  incompatibleSchemaError: IncompatibleSqlSchemaError;
  options: Options;
  instanceId: string;
  databaseId: string;
  allowNonInteractiveMigration: boolean;
}): Promise<Diff[]> {
  const { incompatibleSchemaError, options, instanceId, databaseId, allowNonInteractiveMigration } =
    args;
  const projectId = needProjectId(options);
  const iamUser = await setupIAMUser(instanceId, databaseId, options);
  const choice = await promptForSchemaMigration(
    options,
    databaseId,
    incompatibleSchemaError,
    allowNonInteractiveMigration,
  );
  const commandsToExecute = incompatibleSchemaError.diffs
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
        `SET ROLE "${firebaseowner(databaseId)}"`,
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
    return incompatibleSchemaError.diffs;
  }
  return [];
}

async function promptForSchemaMigration(
  options: Options,
  databaseName: string,
  err: IncompatibleSqlSchemaError,
  allowNonInteractiveMigration: boolean,
): Promise<"none" | "safe" | "all"> {
  displaySchemaChanges(err);
  if (!options.nonInteractive) {
    // Always prompt in interactive mode. Desturctive migrations are too potentially dangerous to not prompt for with --force
    const choices = err.destructive
      ? [
          { name: "Execute all changes (including destructive changes)", value: "all" },
          { name: "Execute only safe changes", value: "safe" },
          { name: "Abort changes", value: "none" },
        ]
      : [
          { name: "Execute changes", value: "safe" },
          { name: "Abort changes", value: "none" },
        ];
    return await promptOnce({
      message: `Would you like to execute these changes against ${databaseName}?`,
      type: "list",
      choices,
    });
  } else if (!allowNonInteractiveMigration) {
    // `deploy --nonInteractive` performs no migrations
    logger.error(
      "Your database schema is incompatible with your Data Connect schema. Run `firebase dataconnect:sql:migrate` to migrate your database schema",
    );
    return "none";
  } else if (options.force) {
    // `dataconnect:sql:migrate --nonInteractive --force` performs all migrations
    return "all";
  } else if (!err.destructive) {
    // `dataconnect:sql:migrate --nonInteractive` performs only safe migrations
    return "safe";
  } else {
    // `dataconnect:sql:migrate --nonInteractive` errors out if there are destructive migrations
    logger.error(
      "This schema migration includes potentially destructive changes. If you'd like to execute it anyway, rerun this command with --force",
    );
    return "none";
  }
}

function displaySchemaChanges(error: IncompatibleSqlSchemaError) {
  const message =
    "Your new schema is incompatible with the schema of your CloudSQL database. " +
    "The following SQL statements will migrate your database schema to match your new Data Connect schema.\n" +
    error.diffs.map(toString).join("\n");
  logLabeledWarning("dataconnect", message);
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
