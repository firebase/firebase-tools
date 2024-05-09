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
  const { serviceName, instanceName, databaseId } = getIdentifiers(schema);
  await ensureServiceIsConnectedToCloudSql(serviceName, instanceName, databaseId);
  try {
    await upsertSchema(schema, /** validateOnly=*/ true);
  } catch (err: any) {
    const invalidConnectors = errors.getInvalidConnectors(err);
    if (invalidConnectors.length) {
      displayInvalidConnectors(invalidConnectors);
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
  const { options, schema, allowNonInteractiveMigration, validateOnly } = args;

  const { serviceName, instanceId, instanceName, databaseId } = getIdentifiers(schema);
  await ensureServiceIsConnectedToCloudSql(serviceName, instanceName, databaseId);
  try {
    await upsertSchema(schema, validateOnly);
    logger.debug(`Database schema was up to date for ${instanceId}:${databaseId}`);
  } catch (err: any) {
    const incompatible = errors.getIncompatibleSchemaError(err);
    const invalidConnectors = errors.getInvalidConnectors(err);
    if (!incompatible && !invalidConnectors.length) {
      // If we got a different type of error, throw it
      throw err;
    }
    const shouldDeleteInvalidConnectors = await promptForInvalidConnectorError(
      options,
      invalidConnectors,
      validateOnly,
    );
    if (!shouldDeleteInvalidConnectors && invalidConnectors.length) {
      const cmd = suggestedCommand(serviceName, invalidConnectors);
      throw new FirebaseError(
        `Command aborted. Try deploying compatible connectors first with ${clc.bold(cmd)}`,
      );
    }
    const migrationMode = incompatible
      ? await promptForSchemaMigration(
          options,
          databaseId,
          incompatible,
          allowNonInteractiveMigration,
        )
      : "none";
    // First, error out if we aren't making all changes
    if (migrationMode === "none" && incompatible) {
      throw new FirebaseError("Command aborted.");
    }

    let diffs: Diff[] = [];
    if (incompatible) {
      diffs = await handleIncompatibleSchemaError({
        options,
        databaseId,
        instanceId,
        incompatibleSchemaError: incompatible,
        choice: migrationMode,
      });
    }

    if (invalidConnectors.length) {
      await deleteInvalidConnectors(invalidConnectors);
    }
    // Then, try to upsert schema again. If there still is an error, just throw it now
    await upsertSchema(schema, validateOnly);
    return diffs;
  }
  return [];
}

function getIdentifiers(schema: Schema): {
  instanceName: string;
  instanceId: string;
  databaseId: string;
  serviceName: string;
} {
  const databaseId = schema.primaryDatasource.postgresql?.database;
  if (!databaseId) {
    throw new FirebaseError(
      "Schema is missing primaryDatasource.postgresql?.database, cannot migrate",
    );
  }
  const instanceName = schema.primaryDatasource.postgresql?.cloudSql.instance;
  if (!instanceName) {
    throw new FirebaseError(
      "tried to migrate schema but instance name was not provided in dataconnect.yaml",
    );
  }
  const instanceId = instanceName.split("/").pop()!;
  const serviceName = schema.name.replace(`/schemas/${SCHEMA_ID}`, "");
  return {
    databaseId,
    instanceId,
    instanceName,
    serviceName,
  };
}

function suggestedCommand(serviceName: string, invalidConnectorNames: string[]): string {
  const serviceId = serviceName.split("/")[5];
  const connectorIds = invalidConnectorNames.map((i) => i.split("/")[7]);
  const onlys = connectorIds.map((c) => `dataconnect:${serviceId}:${c}`).join(",");
  return `firebase deploy --only ${onlys}`;
}

async function handleIncompatibleSchemaError(args: {
  incompatibleSchemaError: IncompatibleSqlSchemaError;
  options: Options;
  instanceId: string;
  databaseId: string;
  choice: "all" | "safe" | "none";
}): Promise<Diff[]> {
  const { incompatibleSchemaError, options, instanceId, databaseId, choice } = args;
  if (incompatibleSchemaError.destructive && choice === "safe") {
    throw new FirebaseError(
      "This schema migration includes potentially destructive changes. If you'd like to execute it anyway, rerun this command with --force",
    );
  }
  const projectId = needProjectId(options);
  const iamUser = await setupIAMUser(instanceId, databaseId, options);

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

async function promptForInvalidConnectorError(
  options: Options,
  invalidConnectors: string[],
  validateOnly: boolean,
): Promise<boolean> {
  if (!invalidConnectors.length) {
    return false;
  }
  displayInvalidConnectors(invalidConnectors);
  if (validateOnly) {
    return false;
  } else if (
    options.force ||
    (!options.nonInteractive &&
      (await confirm({
        ...options,
        message: "Would you like to delete and recreate these connectors?",
      })))
  ) {
    return true;
  }
  return false;
}

async function deleteInvalidConnectors(invalidConnectors: string[]): Promise<void[]> {
  return Promise.all(invalidConnectors.map(deleteConnector));
}

function displayInvalidConnectors(invalidConnectors: string[]) {
  const connectorIds = invalidConnectors.map((i) => i.split("/").pop()).join(", ");
  logLabeledWarning(
    "dataconnect",
    `The schema you are deploying is incompatible with the following existing connectors: ${connectorIds}.`,
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
async function ensureServiceIsConnectedToCloudSql(
  serviceName: string,
  instanceId: string,
  databaseId: string,
) {
  let currentSchema: Schema;
  try {
    currentSchema = await getSchema(serviceName);
  } catch (err: any) {
    if (err.status === 404) {
      // If no schema has been deployed yet, deploy an empty one to get connectivity.
      currentSchema = {
        name: `${serviceName}/schemas/${SCHEMA_ID}`,
        source: {
          files: [],
        },
        primaryDatasource: {
          postgresql: {
            database: databaseId,
            cloudSql: {
              instance: instanceId,
            },
          },
        },
      };
    } else {
      throw err;
    }
  }
  if (
    !currentSchema.primaryDatasource.postgresql ||
    currentSchema.primaryDatasource.postgresql.schemaValidation === "STRICT"
  ) {
    return;
  }
  currentSchema.primaryDatasource.postgresql.schemaValidation = "STRICT";
  try {
    await upsertSchema(currentSchema, /** validateOnly=*/ false);
  } catch (err: any) {
    if (err.status >= 500) {
      throw err;
    }
    logger.debug(err);
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
