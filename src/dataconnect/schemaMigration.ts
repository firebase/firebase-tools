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
import { logLabeledBullet, logLabeledWarning, logLabeledSuccess } from "../utils";
import * as experiments from "../experiments";
import * as errors from "./errors";

export async function diffSchema(schema: Schema): Promise<Diff[]> {
  const { serviceName, instanceName, databaseId } = getIdentifiers(schema);
  await ensureServiceIsConnectedToCloudSql(
    serviceName,
    instanceName,
    databaseId,
    /* linkIfNotConnected=*/ false,
  );

  setCompatibleMode(schema, databaseId, instanceName);
  try {
    await upsertSchema(schema, /** validateOnly=*/ true);
    logLabeledSuccess("dataconnect", `Database schema is up to date.`);
  } catch (err: any) {
    if (err.status !== 400) {
      throw err;
    }
    const invalidConnectors = errors.getInvalidConnectors(err);
    const incompatible = errors.getIncompatibleSchemaError(err);
    if (!incompatible && !invalidConnectors.length) {
      // If we got a different type of error, throw it
      throw err;
    }

    // Display failed precondition errors nicely.
    if (invalidConnectors.length) {
      displayInvalidConnectors(invalidConnectors);
    }
    if (incompatible) {
      displaySchemaChanges(incompatible);
      return incompatible.diffs;
    }
  }
  return [];
}

export async function migrateSchema(args: {
  options: Options;
  schema: Schema;
  /** true for `dataconnect:sql:migrate`, false for `deploy` */
  validateOnly: boolean;
}): Promise<Diff[]> {
  const { options, schema, validateOnly } = args;

  const { serviceName, instanceId, instanceName, databaseId } = getIdentifiers(schema);
  await ensureServiceIsConnectedToCloudSql(
    serviceName,
    instanceName,
    databaseId,
    /* linkIfNotConnected=*/ true,
  );

  setCompatibleMode(schema, databaseId, instanceName);

  try {
    await upsertSchema(schema, validateOnly);
    logger.debug(`Database schema was up to date for ${instanceId}:${databaseId}`);
  } catch (err: any) {
    if (err.status !== 400) {
      throw err;
    }
    // Parse and handle failed precondition errors, then retry.
    const incompatible = errors.getIncompatibleSchemaError(err);
    const invalidConnectors = errors.getInvalidConnectors(err);
    if (!incompatible && !invalidConnectors.length) {
      // If we got a different type of error, throw it
      throw err;
    }

    const migrationMode = await promptForSchemaMigration(
      options,
      databaseId,
      incompatible,
      validateOnly,
    );

    const shouldDeleteInvalidConnectors = await promptForInvalidConnectorError(
      options,
      serviceName,
      invalidConnectors,
      validateOnly,
    );

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

    if (shouldDeleteInvalidConnectors) {
      await deleteInvalidConnectors(invalidConnectors);
    }
    if (!validateOnly) {
      // Then, try to upsert schema again. If there still is an error, just throw it now
      await upsertSchema(schema, validateOnly);
    }
    return diffs;
  }
  return [];
}

function setCompatibleMode(schema: Schema, databaseId: string, instanceName: string) {
  if (experiments.isEnabled("fdccompatiblemode")) {
    if (schema.primaryDatasource.postgresql?.schemaValidation) {
      schema.primaryDatasource.postgresql.schemaValidation = "COMPATIBLE";
    } else {
      schema.primaryDatasource = {
        postgresql: {
          database: databaseId,
          cloudSql: {
            instance: instanceName,
          },
          schemaValidation: "COMPATIBLE",
        },
      };
    }
  }
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
  err: IncompatibleSqlSchemaError | undefined,
  validateOnly: boolean,
): Promise<"none" | "all"> {
  if (!err) {
    return "none";
  }
  displaySchemaChanges(err);
  if (!options.nonInteractive) {
    if (validateOnly && options.force) {
      // `firebase dataconnect:sql:migrate --force` performs all migrations
      return "all";
    }
    // `firebase deploy` and `firebase dataconnect:sql:migrate` always prompt for any SQL migration changes.
    // Destructive migrations are too potentially dangerous to not prompt for with --force
    const choices = err.destructive
      ? [
          { name: "Execute all changes (including destructive changes)", value: "all" },
          { name: "Abort changes", value: "none" },
        ]
      : [
          { name: "Execute changes", value: "all" },
          { name: "Abort changes", value: "none" },
        ];
    return await promptOnce({
      message: `Would you like to execute these changes against ${databaseName}?`,
      type: "list",
      choices,
    });
  }
  if (!validateOnly) {
    // `firebase deploy --nonInteractive` performs no migrations
    throw new FirebaseError(
      "Command aborted. Your database schema is incompatible with your Data Connect schema. Run `firebase dataconnect:sql:migrate` to migrate your database schema",
    );
  } else if (options.force) {
    // `dataconnect:sql:migrate --nonInteractive --force` performs all migrations.
    return "all";
  } else if (!err.destructive) {
    // `dataconnect:sql:migrate --nonInteractive` performs only non-destructive migrations.
    return "all";
  } else {
    // `dataconnect:sql:migrate --nonInteractive` errors out if there are destructive migrations
    throw new FirebaseError(
      "Command aborted. This schema migration includes potentially destructive changes. If you'd like to execute it anyway, rerun this command with --force",
    );
  }
}

async function promptForInvalidConnectorError(
  options: Options,
  serviceName: string,
  invalidConnectors: string[],
  validateOnly: boolean,
): Promise<boolean> {
  if (!invalidConnectors.length) {
    return false;
  }
  displayInvalidConnectors(invalidConnectors);
  if (validateOnly) {
    if (options.force) {
      // `firebase dataconnect:sql:migrate --force` ignores invalid connectors.
      return false;
    }
    // `firebase dataconnect:sql:migrate` aborts if there are invalid connectors.
    throw new FirebaseError(
      `Command aborted. If you'd like to migrate it anyway, you may override with --force.`,
    );
  }
  if (options.force) {
    // `firebase deploy --force` will delete invalid connectors without prompting.
    return true;
  }
  // `firebase deploy` prompts in case of invalid connectors.
  if (
    !options.nonInteractive &&
    (await confirm({
      ...options,
      message: `Would you like to delete and recreate these connectors? This will cause ${clc.red(`downtime.`)}.`,
    }))
  ) {
    return true;
  }
  const cmd = suggestedCommand(serviceName, invalidConnectors);
  throw new FirebaseError(
    `Command aborted. Try deploying those connectors first with ${clc.bold(cmd)}`,
  );
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
    `This is a ${clc.red("breaking")} change and may break existing apps.`,
  );
}

// If a service has never had a schema with schemaValidation=strict
// (ie when users create a service in console),
// the backend will not have the necessary permissions to check cSQL for differences.
// We fix this by upserting the currently deployed schema with schemaValidation=strict,
async function ensureServiceIsConnectedToCloudSql(
  serviceName: string,
  instanceId: string,
  databaseId: string,
  linkIfNotConnected: boolean,
) {
  let currentSchema = await getSchema(serviceName);
  if (!currentSchema) {
    if (!linkIfNotConnected) {
      logLabeledWarning("dataconnect", `Not yet linked to the Cloud SQL instance.`);
      return;
    }
    // TODO: make this prompt
    // Should we upsert service here as well? so `database:sql:migrate` work for new service as well.
    logLabeledBullet("dataconnect", `Linking the Cloud SQL instance...`);
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
  }
  const postgresql = currentSchema.primaryDatasource.postgresql;
  if (postgresql?.cloudSql.instance !== instanceId) {
    logLabeledWarning(
      "dataconnect",
      `Switching connected Cloud SQL instance\nFrom ${postgresql?.cloudSql.instance}\nTo ${instanceId}`,
    );
  }
  if (postgresql?.database !== databaseId) {
    logLabeledWarning(
      "dataconnect",
      `Switching connected Postgres database from ${postgresql?.database} to ${databaseId}`,
    );
  }
  if (!postgresql || postgresql.schemaValidation === "STRICT") {
    return;
  }
  postgresql.schemaValidation = "STRICT";
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
  switch (error.violationType) {
    case "INCOMPATIBLE_SCHEMA":
      {
        const message =
          "Your new schema is incompatible with the schema of your CloudSQL database. " +
          "The following SQL statements will migrate your database schema to match your new Data Connect schema.\n" +
          error.diffs.map(toString).join("\n");
        logLabeledWarning("dataconnect", message);
      }
      break;
    case "INACCESSIBLE_SCHEMA":
      {
        const message =
          "Cannot access your CloudSQL database to validate schema. " +
          "The following SQL statements can setup a new database schema.\n" +
          error.diffs.map(toString).join("\n");
        logLabeledWarning("dataconnect", message);
        logLabeledWarning("dataconnect", "Some SQL resources may already exist.");
      }
      break;
    default:
      throw new FirebaseError(
        `Unknown schema violation type: ${error.violationType}, IncompatibleSqlSchemaError: ${error}`,
      );
  }
}

function toString(diff: Diff) {
  return `\/** ${diff.destructive ? clc.red("Destructive: ") : ""}${diff.description}*\/\n${format(diff.sql, { language: "postgresql" })}`;
}
