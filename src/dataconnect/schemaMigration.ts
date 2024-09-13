import * as clc from "colorette";
import { format } from "sql-formatter";

import { IncompatibleSqlSchemaError, Diff, SCHEMA_ID, SchemaValidation } from "./types";
import { getSchema, upsertSchema, deleteConnector } from "./client";
import {
  setupIAMUsers,
  getIAMUser,
  executeSqlCmdsAsIamUser,
  executeSqlCmdsAsSuperUser,
} from "../gcp/cloudsql/connect";
import {
  firebaseowner,
  iamUserIsCSQLAdmin,
  checkSQLRoleIsGranted,
} from "../gcp/cloudsql/permissions";
import { promptOnce, confirm } from "../prompt";
import { logger } from "../logger";
import { Schema } from "./types";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { logLabeledBullet, logLabeledWarning, logLabeledSuccess } from "../utils";
import * as experiments from "../experiments";
import * as errors from "./errors";

export async function diffSchema(
  schema: Schema,
  schemaValidation?: SchemaValidation,
): Promise<Diff[]> {
  const { serviceName, instanceName, databaseId } = getIdentifiers(schema);
  await ensureServiceIsConnectedToCloudSql(
    serviceName,
    instanceName,
    databaseId,
    /* linkIfNotConnected=*/ false,
  );
  let diffs: Diff[] = [];

  let validationMode: SchemaValidation = "STRICT";
  if (experiments.isEnabled("fdccompatiblemode")) {
    if (!schemaValidation) {
      // If the schema validation mode is unset, we surface both STRICT and COMPATIBLE mode diffs, starting with COMPATIBLE.
      validationMode = "COMPATIBLE";
    } else {
      validationMode = schemaValidation;
    }
  }
  setSchemaValidationMode(schema, validationMode);

  try {
    if (!schemaValidation && experiments.isEnabled("fdccompatiblemode")) {
      logLabeledBullet("dataconnect", `generating required schema changes...`);
    }
    await upsertSchema(schema, /** validateOnly=*/ true);
    if (validationMode === "STRICT") {
      logLabeledSuccess("dataconnect", `Database schema is up to date.`);
    } else {
      logLabeledSuccess("dataconnect", `Database schema is compatible.`);
    }
  } catch (err: any) {
    if (err?.status !== 400) {
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
      displaySchemaChanges(incompatible, validationMode, instanceName, databaseId);
      diffs = incompatible.diffs;
    }
  }

  if (experiments.isEnabled("fdccompatiblemode")) {
    // If the validation mode is unset, then we also surface any additional optional STRICT diffs.
    if (!schemaValidation) {
      validationMode = "STRICT";
      setSchemaValidationMode(schema, validationMode);
      try {
        logLabeledBullet("dataconnect", `generating schema changes, including optional changes...`);
        await upsertSchema(schema, /** validateOnly=*/ true);
        logLabeledSuccess("dataconnect", `no additional optional changes`);
      } catch (err: any) {
        if (err?.status !== 400) {
          throw err;
        }
        const incompatible = errors.getIncompatibleSchemaError(err);
        if (incompatible) {
          if (!diffsEqual(diffs, incompatible.diffs)) {
            if (diffs.length === 0) {
              displaySchemaChanges(
                incompatible,
                "STRICT_AFTER_COMPATIBLE",
                instanceName,
                databaseId,
              );
            } else {
              displaySchemaChanges(incompatible, validationMode, instanceName, databaseId);
            }
            // Return STRICT diffs if the --json flag is passed and schemaValidation is unset.
            diffs = incompatible.diffs;
          } else {
            logLabeledSuccess("dataconnect", `no additional optional changes`);
          }
        }
      }
    }
  }
  return diffs;
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

  const validationMode = experiments.isEnabled("fdccompatiblemode") ? "COMPATIBLE" : "STRICT";
  setSchemaValidationMode(schema, validationMode);

  try {
    await upsertSchema(schema, validateOnly);
    logger.debug(`Database schema was up to date for ${instanceId}:${databaseId}`);
  } catch (err: any) {
    if (err?.status !== 400) {
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
      instanceName,
      databaseId,
      incompatible,
      validateOnly,
      validationMode,
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

function diffsEqual(x: Diff[], y: Diff[]): boolean {
  if (x.length !== y.length) {
    return false;
  }
  for (let i = 0; i < x.length; i++) {
    if (
      x[i].description !== y[i].description ||
      x[i].destructive !== y[i].destructive ||
      x[i].sql !== y[i].sql
    ) {
      return false;
    }
  }
  return true;
}

function setSchemaValidationMode(schema: Schema, schemaValidation: SchemaValidation) {
  if (experiments.isEnabled("fdccompatiblemode") && schema.primaryDatasource.postgresql) {
    schema.primaryDatasource.postgresql.schemaValidation = schemaValidation;
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
    const commandsToExecuteBySuperUser = commandsToExecute.filter(
      (sql) => sql.startsWith("CREATE EXTENSION") || sql.startsWith("CREATE SCHEMA"),
    );
    const commandsToExecuteByOwner = commandsToExecute.filter(
      (sql) => !commandsToExecuteBySuperUser.includes(sql),
    );

    const userIsCSQLAdmin = await iamUserIsCSQLAdmin(options);

    if (!userIsCSQLAdmin && commandsToExecuteBySuperUser.length) {
      throw new FirebaseError(`Some SQL commands required for this migration require Admin permissions.\n 
        Please ask a user with 'roles/cloudsql.admin' to apply the following commands.\n
        ${commandsToExecuteBySuperUser.join("\n")}`);
    }

    // TODO (tammam-g): at some point we would want to only run this after notifying the admin but
    // until we confirm stability it's ok to run it on every migration by admin user.
    if (userIsCSQLAdmin) {
      await setupIAMUsers(instanceId, databaseId, options);
    }

    // Test if iam user has access to the roles required for this migration
    if (
      !(await checkSQLRoleIsGranted(
        options,
        instanceId,
        databaseId,
        firebaseowner(databaseId),
        (await getIAMUser(options)).user,
      ))
    ) {
      throw new FirebaseError(
        `Command aborted. Only users granted firebaseowner SQL role can run migrations.`,
      );
    }

    if (commandsToExecuteBySuperUser.length) {
      logger.info(
        `The diffs require CloudSQL superuser permissions, attempting to apply changes as superuser.`,
      );
      await executeSqlCmdsAsSuperUser(
        options,
        instanceId,
        databaseId,
        commandsToExecuteBySuperUser,
        /** silent=*/ false,
      );
    }

    if (commandsToExecuteByOwner.length) {
      await executeSqlCmdsAsIamUser(
        options,
        instanceId,
        databaseId,
        [`SET ROLE "${firebaseowner(databaseId)}"`, ...commandsToExecuteByOwner],
        /** silent=*/ false,
      );
      return incompatibleSchemaError.diffs;
    }
  }
  return [];
}

async function promptForSchemaMigration(
  options: Options,
  instanceName: string,
  databaseId: string,
  err: IncompatibleSqlSchemaError | undefined,
  validateOnly: boolean,
  schemaValidation: SchemaValidation,
): Promise<"none" | "all"> {
  if (!err) {
    return "none";
  }
  displaySchemaChanges(err, schemaValidation, instanceName, databaseId);
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
      message: `Would you like to execute these changes against ${databaseId}?`,
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
    if (err?.status >= 500) {
      throw err;
    }
    logger.debug(err);
  }
}

function displaySchemaChanges(
  error: IncompatibleSqlSchemaError,
  schemaValidation: SchemaValidation | "STRICT_AFTER_COMPATIBLE",
  instanceName: string,
  databaseId: string,
) {
  switch (error.violationType) {
    case "INCOMPATIBLE_SCHEMA":
      {
        let message;
        if (schemaValidation === "COMPATIBLE") {
          message =
            "Your new application schema is incompatible with the schema of your PostgreSQL database " +
            databaseId +
            " in your CloudSQL instance " +
            instanceName +
            ". " +
            "The following SQL statements will migrate your database schema to be compatible with your new Data Connect schema.\n" +
            error.diffs.map(toString).join("\n");
        } else if (schemaValidation === "STRICT_AFTER_COMPATIBLE") {
          message =
            "Your new application schema is compatible with the schema of your PostgreSQL database " +
            databaseId +
            " in your CloudSQL instance " +
            instanceName +
            ", but contains unused tables or columns. " +
            "The following optional SQL statements will migrate your database schema to match your new Data Connect schema.\n" +
            error.diffs.map(toString).join("\n");
        } else {
          message =
            "Your new application schema does not match the schema of your PostgreSQL database " +
            databaseId +
            " in your CloudSQL instance " +
            instanceName +
            ". " +
            "The following SQL statements will migrate your database schema to match your new Data Connect schema.\n" +
            error.diffs.map(toString).join("\n");
        }
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
