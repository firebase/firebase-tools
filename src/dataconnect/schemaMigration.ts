import * as clc from "colorette";
import { format } from "sql-formatter";

import { IncompatibleSqlSchemaError, Diff, SCHEMA_ID } from "./types";
import { getSchema, upsertSchema, deleteConnector } from "./client";
import { execute, firebaseowner, setupIAMUser } from "../gcp/cloudsql/connect";
import { promptOnce, confirm } from "../prompt";
import { logger } from "../logger";
import { Schema } from "./types";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { needProjectId } from "../projectUtils";
import { logLabeledWarning, logLabeledSuccess } from "../utils";
import * as errors from "./errors";

export async function diffSchema(schema: Schema): Promise<Diff[]> {
  const dbName = schema.primaryDatasource.postgresql?.database;
  const instanceName = schema.primaryDatasource.postgresql?.cloudSql.instance;
  if (!instanceName || !dbName) {
    throw new FirebaseError(`tried to diff schema but ${instanceName} was undefined`);
  }
  try {
    const serviceName = schema.name.replace(`/schemas/${SCHEMA_ID}`, "");
    await ensureServiceIsConnectedToCloudSql(serviceName);
    await upsertSchema(schema, /** validateOnly=*/ true);
  } catch (err: any) {
    const invalid = errors.isInvalidConnectorError(err);
    if (invalid) {
      displayInvalidConnectors(errors.getInvalidConnectorIds(err.message));
    }
    const incompatible = errors.getIncompatibleSchemaError(err);
    if (incompatible) {
      displaySchemaChanges(incompatible);
      return incompatible.diffs;
    }
  }
  logLabeledSuccess("dataconnect", `Database schema is up to date.`);
  return [];
}

export async function migrateSchema(args: {
  options: Options;
  schema: Schema;
  allowNonInteractiveMigration: boolean;
  validateOnly: boolean;
}): Promise<Diff[]> {
  const { options, schema, validateOnly } = args;

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
  const serviceName = schema.name.replace(`/schemas/${SCHEMA_ID}`, "");
  try {
    await ensureServiceIsConnectedToCloudSql(serviceName);
    await upsertSchema(schema, validateOnly);
    logger.debug(`Database schema was up to date for ${instanceId}:${databaseId}`);
  } catch (err: any) {
    const incompatible = errors.getIncompatibleSchemaError(err);
    const invalid = errors.isInvalidConnectorError(err);
    if (!incompatible && !invalid) {
      // If we got a different type of error, throw it
      throw err;
    }
    if (invalid) {
      await handleInvalidConnectorError(options, err, serviceName, validateOnly);
    }
    if (incompatible) {
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
  return [];
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

async function handleInvalidConnectorError(
  options: Options,
  err: any,
  serviceName: string,
  validateOnly: boolean,
): Promise<void> {
  if (!errors.isInvalidConnectorError) {
    throw err;
  }
  const invalidConnectors = errors.getInvalidConnectorIds(err.message);
  displayInvalidConnectors(invalidConnectors);
  if (validateOnly) {
    return;
  } else if (
    options.force ||
    (!options.nonInteractive &&
      (await confirm({
        ...options,
        message: "Would you like to delete and recreate these connectors?",
      })))
  ) {
    await Promise.all(
      invalidConnectors.map((c) => {
        const connectorName = `${serviceName}/connectors/${c}`;
        return deleteConnector(connectorName);
      }),
    );
    return;
  }
  throw new FirebaseError(
    "Command aborted. Rerun with --force to delete and recreate invalid connectors",
    { original: err },
  );
}

function displayInvalidConnectors(invalidConnectors: string[]) {
  logLabeledWarning(
    "dataconnect",
    `The schema you are deploying is incompatible with the following existing connectors: ${invalidConnectors.join(", ")}.`,
  );
  logLabeledWarning(
    "dataconnect",
    `This is a ${clc.red("breaking")} change and will cause a brief downtime.`,
  );
}

// If a service has never had a schema with schemaValidation=strict
// (ie when users create a service in console),
// the backend will not have the necesary permissions to check cSQL for differences.
// We fix this by upserting the currently deployed schema with schemaValidation=strict,
async function ensureServiceIsConnectedToCloudSql(serviceName: string) {
  let currentSchema;
  try {
    currentSchema = await getSchema(serviceName);
  } catch (err: any) {
    if (err.status === 404) {
      return;
    }
    throw err;
  }
  if (
    !currentSchema.primaryDatasource.postgresql ||
    currentSchema.primaryDatasource.postgresql.schemaValidation === "STRICT"
  ) {
    // Only want to do this coming from console half deployed state. If the current schema is "STRICT" mode,
    // or if there is not postgres attached, don't try this.
    return;
  }
  currentSchema.primaryDatasource.postgresql.schemaValidation = "STRICT";
  await upsertSchema(currentSchema, /** validateOnly=*/ false);
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
