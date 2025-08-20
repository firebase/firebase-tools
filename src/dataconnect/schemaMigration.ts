import * as clc from "colorette";
import { format } from "sql-formatter";

import { IncompatibleSqlSchemaError, Diff, SCHEMA_ID, SchemaValidation } from "./types";
import { getSchema, upsertSchema, deleteConnector } from "./client";
import {
  getIAMUser,
  executeSqlCmdsAsIamUser,
  executeSqlCmdsAsSuperUser,
  toDatabaseUser,
  setupIAMUsers,
} from "../gcp/cloudsql/connect";
import { needProjectId } from "../projectUtils";
import {
  checkSQLRoleIsGranted,
  fdcSqlRoleMap,
  setupSQLPermissions,
  getSchemaMetadata,
  SchemaSetupStatus,
  grantRoleTo,
} from "../gcp/cloudsql/permissionsSetup";
import { DEFAULT_SCHEMA, firebaseowner } from "../gcp/cloudsql/permissions";
import { select, confirm } from "../prompt";
import { logger } from "../logger";
import { Schema } from "./types";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { logLabeledBullet, logLabeledWarning, logLabeledSuccess } from "../utils";
import { iamUserIsCSQLAdmin } from "../gcp/cloudsql/cloudsqladmin";
import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import * as errors from "./errors";
import { cloudSQLBeingCreated } from "./provisionCloudSql";
import { requireAuth } from "../requireAuth";

async function setupSchemaIfNecessary(
  instanceId: string,
  databaseId: string,
  options: Options,
): Promise<SchemaSetupStatus.GreenField | SchemaSetupStatus.BrownField> {
  try {
    await setupIAMUsers(instanceId, options);
    const schemaInfo = await getSchemaMetadata(instanceId, databaseId, DEFAULT_SCHEMA, options);
    switch (schemaInfo.setupStatus) {
      case SchemaSetupStatus.BrownField:
      case SchemaSetupStatus.GreenField:
        logger.debug(
          `Cloud SQL Database ${instanceId}:${databaseId} is already set up in ${schemaInfo.setupStatus}`,
        );
        return schemaInfo.setupStatus;
      case SchemaSetupStatus.NotSetup:
      case SchemaSetupStatus.NotFound:
        logLabeledBullet("dataconnect", "Setting up Cloud SQL Database SQL permissions...");
        return await setupSQLPermissions(
          instanceId,
          databaseId,
          schemaInfo,
          options,
          /* silent=*/ true,
        );
      default:
        throw new FirebaseError(`Unexpected schema setup status: ${schemaInfo.setupStatus}`);
    }
  } catch (err: any) {
    throw new FirebaseError(
      `Cannot setup Postgres SQL permissions of Cloud SQL database ${instanceId}:${databaseId}\n${err}`,
    );
  }
}

export async function diffSchema(
  options: Options,
  schema: Schema,
  schemaValidation?: SchemaValidation,
): Promise<Diff[]> {
  // If the schema validation mode is unset, we diff in strict mode first.
  let validationMode: SchemaValidation = schemaValidation ?? "STRICT";
  setSchemaValidationMode(schema, validationMode);
  displayStartSchemaDiff(validationMode);

  const { serviceName, instanceName, databaseId, instanceId } = getIdentifiers(schema);
  await ensureServiceIsConnectedToCloudSql(
    serviceName,
    instanceName,
    databaseId,
    /* linkIfNotConnected=*/ false,
  );

  let incompatible: IncompatibleSqlSchemaError | undefined = undefined;
  try {
    await upsertSchema(schema, /** validateOnly=*/ true);
    displayNoSchemaDiff(instanceId, databaseId, validationMode);
  } catch (err: any) {
    if (err?.status !== 400) {
      throw err;
    }
    const invalidConnectors = errors.getInvalidConnectors(err);
    incompatible = errors.getIncompatibleSchemaError(err);
    if (!incompatible && !invalidConnectors.length) {
      // If we got a different type of error, throw it
      throw err;
    }
    // Display failed precondition errors nicely.
    if (invalidConnectors.length) {
      displayInvalidConnectors(invalidConnectors);
    }
  }
  if (!incompatible) {
    return [];
  }
  // If the schema validation mode is unset, we diff in strict mode first, then diff in compatible if there are any diffs.
  // It should display both COMPATIBLE and STRICT mode diffs in this order.
  if (schemaValidation) {
    displaySchemaChanges(incompatible, validationMode, instanceName, databaseId);
    return incompatible.diffs;
  }
  const strictIncompatible = incompatible;
  let compatibleIncompatible: IncompatibleSqlSchemaError | undefined = undefined;
  validationMode = "COMPATIBLE";
  setSchemaValidationMode(schema, validationMode);
  try {
    displayStartSchemaDiff(validationMode);
    await upsertSchema(schema, /** validateOnly=*/ true);
    displayNoSchemaDiff(instanceId, databaseId, validationMode);
  } catch (err: any) {
    if (err?.status !== 400) {
      throw err;
    }
    compatibleIncompatible = errors.getIncompatibleSchemaError(err);
  }
  if (!compatibleIncompatible) {
    // No compatible changes.
    displaySchemaChanges(strictIncompatible, "STRICT", instanceName, databaseId);
  } else if (diffsEqual(strictIncompatible.diffs, compatibleIncompatible.diffs)) {
    // Strict and compatible SQL migrations are the same.
    displaySchemaChanges(strictIncompatible, "STRICT", instanceName, databaseId);
  } else {
    // Strict and compatible SQL migrations are different.
    displaySchemaChanges(compatibleIncompatible, "COMPATIBLE", instanceName, databaseId);
    displaySchemaChanges(strictIncompatible, "STRICT_AFTER_COMPATIBLE", instanceName, databaseId);
  }
  // Return STRICT diffs if the --json flag is passed and schemaValidation is unset.
  return incompatible.diffs;
}

export async function migrateSchema(args: {
  options: Options;
  schema: Schema;
  /** true for `dataconnect:sql:migrate`, false for `deploy` */
  validateOnly: boolean;
  schemaValidation?: SchemaValidation;
}): Promise<Diff[]> {
  const { options, schema, validateOnly, schemaValidation } = args;

  // If the schema validation mode is unset, we prompt COMPATIBLE SQL diffs and then STRICT diffs.
  let validationMode: SchemaValidation = schemaValidation ?? "COMPATIBLE";
  setSchemaValidationMode(schema, validationMode);
  displayStartSchemaDiff(validationMode);

  const projectId = needProjectId(options);
  const { serviceName, instanceId, instanceName, databaseId } = getIdentifiers(schema);
  await ensureServiceIsConnectedToCloudSql(
    serviceName,
    instanceName,
    databaseId,
    /* linkIfNotConnected=*/ true,
  );

  // Check if Cloud SQL instance is still being created.
  const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
  if (existingInstance.state === "PENDING_CREATE") {
    const postgresql = schema.datasources.find((d) => d.postgresql)?.postgresql;
    if (!postgresql) {
      throw new FirebaseError(
        `Cannot find Postgres datasource in the schema to deploy: ${serviceName}/schemas/${SCHEMA_ID}.\nIts datasources: ${JSON.stringify(schema.datasources)}`,
      );
    }
    postgresql.schemaValidation = "NONE";
    postgresql.schemaMigration = undefined;
    await upsertSchema(schema, validateOnly);
    postgresql.schemaValidation = undefined;
    postgresql.schemaMigration = "MIGRATE_COMPATIBLE";
    await upsertSchema(schema, validateOnly, /* async= */ true);
    logLabeledWarning(
      "dataconnect",
      `Skip SQL schema migration because Cloud SQL is still being created`,
    );
    return [];
  }

  // Make sure database is setup.
  await setupSchemaIfNecessary(instanceId, databaseId, options);

  let diffs: Diff[] = [];
  try {
    await upsertSchema(schema, validateOnly);
    displayNoSchemaDiff(instanceId, databaseId, validationMode);
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
  }

  // If the validation mode is unset, then we also prompt for any additional optional STRICT diffs.
  if (!schemaValidation) {
    validationMode = "STRICT";
    setSchemaValidationMode(schema, validationMode);
    try {
      await upsertSchema(schema, validateOnly);
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
        instanceName,
        databaseId,
        incompatible,
        validateOnly,
        "STRICT_AFTER_COMPATIBLE",
      );

      if (incompatible) {
        const maybeDiffs = await handleIncompatibleSchemaError({
          options,
          databaseId,
          instanceId,
          incompatibleSchemaError: incompatible,
          choice: migrationMode,
        });
        diffs = diffs.concat(maybeDiffs);
      }
    }
  }
  return diffs;
}

export async function grantRoleToUserInSchema(options: Options, schema: Schema) {
  const role = options.role as string;
  const email = options.email as string;

  const { serviceName, instanceId, instanceName, databaseId } = getIdentifiers(schema);

  await ensureServiceIsConnectedToCloudSql(
    serviceName,
    instanceName,
    databaseId,
    /* linkIfNotConnected=*/ false,
  );

  // Make sure we have the right setup for the requested role grant.
  const schemaSetupStatus = await setupSchemaIfNecessary(instanceId, databaseId, options);

  // Edge case: we can't grant firebase owner unless database is greenfield.
  if (schemaSetupStatus !== SchemaSetupStatus.GreenField && role === "owner") {
    throw new FirebaseError(
      `Owner rule isn't available in ${schemaSetupStatus} databases. If you would like Data Connect to manage and own your database schema, run 'firebase dataconnect:sql:setup'`,
    );
  }

  // Grant the role to the user.
  await grantRoleTo(options, instanceId, databaseId, role, email);
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
  const postgresDatasource = schema.datasources.find((d) => d.postgresql);
  if (postgresDatasource?.postgresql) {
    postgresDatasource.postgresql.schemaValidation = schemaValidation;
  }
}

export function getIdentifiers(schema: Schema): {
  instanceName: string;
  instanceId: string;
  databaseId: string;
  serviceName: string;
} {
  const postgresDatasource = schema.datasources.find((d) => d.postgresql);
  const databaseId = postgresDatasource?.postgresql?.database;
  if (!databaseId) {
    throw new FirebaseError(
      "Data Connect schema must have a postgres datasource with a database name.",
    );
  }
  const instanceName = postgresDatasource?.postgresql?.cloudSql?.instance;
  if (!instanceName) {
    throw new FirebaseError(
      "Data Connect schema must have a postgres datasource with a CloudSQL instance.",
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

    const schemaInfo = await getSchemaMetadata(instanceId, databaseId, DEFAULT_SCHEMA, options);
    if (schemaInfo.setupStatus !== SchemaSetupStatus.GreenField) {
      throw new FirebaseError(
        `Brownfield database are protected from SQL changes by Data Connect.\n` +
          `You can use the SQL diff generated by 'firebase dataconnect:sql:diff' to assist you in applying the required changes to your CloudSQL database. Connector deployment will succeed when there is no required diff changes.\n` +
          `If you would like Data Connect to manage your database schema, run 'firebase dataconnect:sql:setup'`,
      );
    }

    // Test if iam user has access to the roles required for this migration
    const { user, mode } = await getIAMUser(options);
    if (
      !(await checkSQLRoleIsGranted(
        options,
        instanceId,
        databaseId,
        firebaseowner(databaseId),
        user,
      ))
    ) {
      if (!userIsCSQLAdmin) {
        throw new FirebaseError(
          `Command aborted. Only users granted firebaseowner SQL role can run migrations.`,
        );
      }
      logLabeledBullet("dataconnect", `Granting firebaseowner role to myself ${user}...`);
      await grantRoleTo(options, instanceId, databaseId, "owner", user);
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
  validationMode: SchemaValidation | "STRICT_AFTER_COMPATIBLE",
): Promise<"none" | "all"> {
  if (!err) {
    return "none";
  }
  const forceMode = validationMode === "STRICT_AFTER_COMPATIBLE" ? "none" : "all";
  displaySchemaChanges(err, validationMode, instanceName, databaseId);
  if (!options.nonInteractive) {
    if (validateOnly && options.force) {
      // `firebase dataconnect:sql:migrate --force` performs all migrations.
      return forceMode;
    }
    if (validationMode === "STRICT_AFTER_COMPATIBLE") {
      // `firebase deploy` and `firebase dataconnect:sql:migrate` always prompt for any SQL migration changes.
      // Destructive migrations are too potentially dangerous to not prompt for with --force
      const message = `Would you like to execute these optional changes against ${databaseId} in your CloudSQL instance ${instanceName}?`;
      let executeChangePrompt = "Execute optional changes";
      if (err.destructive) {
        executeChangePrompt = executeChangePrompt + " (including destructive changes)";
      }
      const choices = [
        { name: executeChangePrompt, value: "all" },
        { name: "Skip optional changes", value: "none" },
      ] as const;
      return await select({ message, choices, default: forceMode });
    }
    // `firebase deploy` and `firebase dataconnect:sql:migrate` always prompt for any SQL migration changes.
    // Destructive migrations are too potentially dangerous to not prompt for with --force
    const message = `Would you like to execute these changes against ${databaseId} in your CloudSQL instance ${instanceName}?`;
    let executeChangePrompt = "Execute changes";
    if (err.destructive) {
      executeChangePrompt = executeChangePrompt + " (including destructive changes)";
    }
    const choices = [
      { name: executeChangePrompt, value: "all" },
      { name: "Abort changes", value: "none" },
    ] as const;
    const ans = await select<"none" | "all">({ message, choices, default: forceMode });
    if (ans === "none") {
      throw new FirebaseError("Command aborted.");
    }
    return ans;
  }
  if (!validateOnly) {
    // `firebase deploy --nonInteractive` performs no migrations
    throw new FirebaseError(
      "Command aborted. Your database schema is incompatible with your Data Connect schema. Run `firebase dataconnect:sql:migrate` to migrate your database schema",
    );
  } else if (options.force) {
    // `dataconnect:sql:migrate --nonInteractive --force` performs all migrations.
    return forceMode;
  } else if (!err.destructive) {
    // `dataconnect:sql:migrate --nonInteractive` performs only non-destructive migrations.
    return forceMode;
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
    // `firebase dataconnect:sql:migrate` ignores invalid connectors.
    return false;
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
      message: `Would you like to delete and recreate these connectors? This will cause ${clc.red(`downtime`)}.`,
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

/**
 * If the FDC service has never connected to the Cloud SQL instance (ephemeral=false),
 * the backend will not have the necessary permissions to check CSQL for differences.
 *
 * This method makes a best-effort attempt to build the connectivity.
 * We fix this by upserting the currently deployed schema with schemaValidation=strict,
 */
export async function ensureServiceIsConnectedToCloudSql(
  serviceName: string,
  instanceName: string,
  databaseId: string,
  linkIfNotConnected: boolean,
): Promise<void> {
  let currentSchema = await getSchema(serviceName);
  let postgresql = currentSchema?.datasources?.find((d) => d.postgresql)?.postgresql;
  if (
    currentSchema?.reconciling && // active LRO
    // Cloud SQL instance is specified (but not connected)
    postgresql?.ephemeral &&
    postgresql?.cloudSql?.instance &&
    postgresql?.schemaValidation === "NONE"
  ) {
    // [SPECIAL CASE] There is an UpdateSchema LRO waiting for Cloud SQL creation.
    // Error out early because if the next `UpdateSchema` request will get queued until Cloud SQL is created.
    const [, , , , , serviceId] = serviceName.split("/");
    const [, projectId, , , , instanceId] = postgresql.cloudSql.instance.split("/");
    throw new FirebaseError(
      `While checking the service ${serviceId}, ` + cloudSQLBeingCreated(projectId, instanceId),
    );
  }
  if (!currentSchema || !postgresql) {
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
      datasources: [
        {
          postgresql: { ephemeral: true },
        },
      ],
    };
  }
  if (!postgresql) {
    postgresql = currentSchema.datasources[0].postgresql!;
  }

  let alreadyConnected = !postgresql.ephemeral || false;
  if (postgresql.cloudSql?.instance && postgresql.cloudSql.instance !== instanceName) {
    alreadyConnected = false;
    logLabeledWarning(
      "dataconnect",
      `Switching connected Cloud SQL instance\n From ${postgresql.cloudSql.instance}\n To ${instanceName}`,
    );
  }
  if (postgresql.database && postgresql.database !== databaseId) {
    alreadyConnected = false;
    logLabeledWarning(
      "dataconnect",
      `Switching connected Postgres database from ${postgresql.database} to ${databaseId}`,
    );
  }
  if (alreadyConnected) {
    // Skip provisioning connectivity if FDC backend has already connected to this Cloud SQL instance.
    return;
  }
  try {
    postgresql.schemaValidation = "STRICT";
    postgresql.database = databaseId;
    postgresql.cloudSql = { instance: instanceName };
    await upsertSchema(currentSchema, /** validateOnly=*/ false);
  } catch (err: any) {
    if (err?.status >= 500) {
      throw err;
    }
    logger.debug(`Failed to ensure service is connected to Cloud SQL: ${err.message}`);
  }
}

function displayStartSchemaDiff(validationMode: SchemaValidation): void {
  switch (validationMode) {
    case "COMPATIBLE":
      logLabeledBullet("dataconnect", `Generating SQL schema migrations to be compatible...`);
      break;
    case "STRICT":
      logLabeledBullet("dataconnect", `Generating SQL schema migrations to match exactly...`);
      break;
  }
}

function displayNoSchemaDiff(
  instanceId: string,
  databaseId: string,
  validationMode: SchemaValidation,
): void {
  switch (validationMode) {
    case "COMPATIBLE":
      logLabeledSuccess(
        "dataconnect",
        `Database schema of ${instanceId}:${databaseId} is compatible with Data Connect Schema.`,
      );
      break;
    case "STRICT":
      logLabeledSuccess(
        "dataconnect",
        `Database schema of ${instanceId}:${databaseId} matches Data Connect Schema exactly.`,
      );
      break;
  }
}

function displaySchemaChanges(
  error: IncompatibleSqlSchemaError,
  validationMode: SchemaValidation | "STRICT_AFTER_COMPATIBLE",
  instanceName: string,
  databaseId: string,
) {
  switch (error.violationType) {
    case "INCOMPATIBLE_SCHEMA":
      {
        let message;
        if (validationMode === "COMPATIBLE") {
          message =
            "Your PostgreSQL database " +
            databaseId +
            " in your CloudSQL instance " +
            instanceName +
            " must be migrated in order to be compatible with your application schema. " +
            "The following SQL statements will migrate your database schema to be compatible with your new Data Connect schema.\n" +
            error.diffs.map(toString).join("\n");
        } else if (validationMode === "STRICT_AFTER_COMPATIBLE") {
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
            "Your PostgreSQL database " +
            databaseId +
            " in your CloudSQL instance " +
            instanceName +
            " must be migrated in order to match your application schema. " +
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
