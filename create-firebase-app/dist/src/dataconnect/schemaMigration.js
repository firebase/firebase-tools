"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureServiceIsConnectedToCloudSql = exports.getIdentifiers = exports.grantRoleToUserInSchema = exports.migrateSchema = exports.diffSchema = void 0;
const clc = require("colorette");
const sql_formatter_1 = require("sql-formatter");
const types_1 = require("./types");
const client_1 = require("./client");
const connect_1 = require("../gcp/cloudsql/connect");
const projectUtils_1 = require("../projectUtils");
const permissionsSetup_1 = require("../gcp/cloudsql/permissionsSetup");
const permissions_1 = require("../gcp/cloudsql/permissions");
const prompt_1 = require("../prompt");
const logger_1 = require("../logger");
const error_1 = require("../error");
const utils_1 = require("../utils");
const cloudsqladmin_1 = require("../gcp/cloudsql/cloudsqladmin");
const cloudSqlAdminClient = require("../gcp/cloudsql/cloudsqladmin");
const errors = require("./errors");
const provisionCloudSql_1 = require("./provisionCloudSql");
const requireAuth_1 = require("../requireAuth");
async function setupSchemaIfNecessary(instanceId, databaseId, options) {
    try {
        await (0, connect_1.setupIAMUsers)(instanceId, options);
        const schemaInfo = await (0, permissionsSetup_1.getSchemaMetadata)(instanceId, databaseId, permissions_1.DEFAULT_SCHEMA, options);
        switch (schemaInfo.setupStatus) {
            case permissionsSetup_1.SchemaSetupStatus.BrownField:
            case permissionsSetup_1.SchemaSetupStatus.GreenField:
                logger_1.logger.debug(`Cloud SQL Database ${instanceId}:${databaseId} is already set up in ${schemaInfo.setupStatus}`);
                return schemaInfo.setupStatus;
            case permissionsSetup_1.SchemaSetupStatus.NotSetup:
            case permissionsSetup_1.SchemaSetupStatus.NotFound:
                (0, utils_1.logLabeledBullet)("dataconnect", "Setting up Cloud SQL Database SQL permissions...");
                return await (0, permissionsSetup_1.setupSQLPermissions)(instanceId, databaseId, schemaInfo, options, 
                /* silent=*/ true);
            default:
                throw new error_1.FirebaseError(`Unexpected schema setup status: ${schemaInfo.setupStatus}`);
        }
    }
    catch (err) {
        throw new error_1.FirebaseError(`Cannot setup Postgres SQL permissions of Cloud SQL database ${instanceId}:${databaseId}\n${err}`);
    }
}
async function diffSchema(options, schema, schemaValidation) {
    // If the schema validation mode is unset, we diff in strict mode first.
    let validationMode = schemaValidation !== null && schemaValidation !== void 0 ? schemaValidation : "STRICT";
    setSchemaValidationMode(schema, validationMode);
    displayStartSchemaDiff(validationMode);
    const { serviceName, instanceName, databaseId, instanceId } = getIdentifiers(schema);
    await ensureServiceIsConnectedToCloudSql(serviceName, instanceName, databaseId, 
    /* linkIfNotConnected=*/ false);
    let incompatible = undefined;
    try {
        await (0, client_1.upsertSchema)(schema, /** validateOnly=*/ true);
        displayNoSchemaDiff(instanceId, databaseId, validationMode);
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.status) !== 400) {
            throw err;
        }
        incompatible = errors.getIncompatibleSchemaError(err);
        const invalidConnectors = errors.getInvalidConnectors(err);
        if (!incompatible && !invalidConnectors.length) {
            // If we got a different type of error, throw it
            const gqlErrs = errors.getGQLErrors(err);
            if (gqlErrs) {
                throw new error_1.FirebaseError(`There are errors in your schema files:\n${gqlErrs}`);
            }
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
        displaySchemaChanges(incompatible, validationMode);
        return incompatible.diffs;
    }
    const strictIncompatible = incompatible;
    let compatibleIncompatible = undefined;
    validationMode = "COMPATIBLE";
    setSchemaValidationMode(schema, validationMode);
    try {
        displayStartSchemaDiff(validationMode);
        await (0, client_1.upsertSchema)(schema, /** validateOnly=*/ true);
        displayNoSchemaDiff(instanceId, databaseId, validationMode);
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.status) !== 400) {
            throw err;
        }
        compatibleIncompatible = errors.getIncompatibleSchemaError(err);
    }
    if (!compatibleIncompatible) {
        // No compatible changes.
        displaySchemaChanges(strictIncompatible, "STRICT");
    }
    else if (diffsEqual(strictIncompatible.diffs, compatibleIncompatible.diffs)) {
        // Strict and compatible SQL migrations are the same.
        displaySchemaChanges(strictIncompatible, "STRICT");
    }
    else {
        // Strict and compatible SQL migrations are different.
        displaySchemaChanges(compatibleIncompatible, "COMPATIBLE");
        displaySchemaChanges(strictIncompatible, "STRICT_AFTER_COMPATIBLE");
    }
    // Return STRICT diffs if the --json flag is passed and schemaValidation is unset.
    return incompatible.diffs;
}
exports.diffSchema = diffSchema;
async function migrateSchema(args) {
    var _a;
    const { options, schema, validateOnly, schemaValidation } = args;
    // If the schema validation mode is unset, we prompt COMPATIBLE SQL diffs and then STRICT diffs.
    let validationMode = schemaValidation !== null && schemaValidation !== void 0 ? schemaValidation : "COMPATIBLE";
    setSchemaValidationMode(schema, validationMode);
    displayStartSchemaDiff(validationMode);
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const { serviceName, instanceId, instanceName, databaseId } = getIdentifiers(schema);
    await ensureServiceIsConnectedToCloudSql(serviceName, instanceName, databaseId, 
    /* linkIfNotConnected=*/ true);
    // Check if Cloud SQL instance is still being created.
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    if (existingInstance.state === "PENDING_CREATE") {
        const postgresql = (_a = schema.datasources.find((d) => d.postgresql)) === null || _a === void 0 ? void 0 : _a.postgresql;
        if (!postgresql) {
            throw new error_1.FirebaseError(`Cannot find Postgres datasource in the schema to deploy: ${serviceName}/schemas/${types_1.SCHEMA_ID}.\nIts datasources: ${JSON.stringify(schema.datasources)}`);
        }
        postgresql.schemaValidation = "NONE";
        postgresql.schemaMigration = undefined;
        await (0, client_1.upsertSchema)(schema, validateOnly);
        postgresql.schemaValidation = undefined;
        postgresql.schemaMigration = "MIGRATE_COMPATIBLE";
        await (0, client_1.upsertSchema)(schema, validateOnly, /* async= */ true);
        (0, utils_1.logLabeledWarning)("dataconnect", `Skip SQL schema migration because Cloud SQL is still being created`);
        return [];
    }
    // Make sure database is setup.
    await setupSchemaIfNecessary(instanceId, databaseId, options);
    let diffs = [];
    try {
        await (0, client_1.upsertSchema)(schema, validateOnly);
        displayNoSchemaDiff(instanceId, databaseId, validationMode);
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.status) !== 400) {
            throw err;
        }
        // Parse and handle failed precondition errors, then retry.
        const incompatible = errors.getIncompatibleSchemaError(err);
        const invalidConnectors = errors.getInvalidConnectors(err);
        if (!incompatible && !invalidConnectors.length) {
            // If we got a different type of error, throw it
            const gqlErrs = errors.getGQLErrors(err);
            if (gqlErrs) {
                throw new error_1.FirebaseError(`There are errors in your schema files:\n${gqlErrs}`);
            }
            throw err;
        }
        const migrationMode = await promptForSchemaMigration(options, instanceId, databaseId, incompatible, validateOnly, validationMode);
        const shouldDeleteInvalidConnectors = await promptForInvalidConnectorError(options, serviceName, invalidConnectors, validateOnly);
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
            await (0, client_1.upsertSchema)(schema, validateOnly);
        }
    }
    // If the validation mode is unset, then we also prompt for any additional optional STRICT diffs.
    if (!schemaValidation) {
        validationMode = "STRICT";
        setSchemaValidationMode(schema, validationMode);
        try {
            await (0, client_1.upsertSchema)(schema, validateOnly);
        }
        catch (err) {
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
            const migrationMode = await promptForSchemaMigration(options, instanceId, databaseId, incompatible, validateOnly, "STRICT_AFTER_COMPATIBLE");
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
exports.migrateSchema = migrateSchema;
async function grantRoleToUserInSchema(options, schema) {
    const role = options.role;
    const email = options.email;
    const { serviceName, instanceId, instanceName, databaseId } = getIdentifiers(schema);
    await ensureServiceIsConnectedToCloudSql(serviceName, instanceName, databaseId, 
    /* linkIfNotConnected=*/ false);
    // Make sure we have the right setup for the requested role grant.
    const schemaSetupStatus = await setupSchemaIfNecessary(instanceId, databaseId, options);
    // Edge case: we can't grant firebase owner unless database is greenfield.
    if (schemaSetupStatus !== permissionsSetup_1.SchemaSetupStatus.GreenField && role === "owner") {
        throw new error_1.FirebaseError(`Owner rule isn't available in ${schemaSetupStatus} databases. If you would like Data Connect to manage and own your database schema, run 'firebase dataconnect:sql:setup'`);
    }
    // Grant the role to the user.
    await (0, permissionsSetup_1.grantRoleTo)(options, instanceId, databaseId, role, email);
}
exports.grantRoleToUserInSchema = grantRoleToUserInSchema;
function diffsEqual(x, y) {
    if (x.length !== y.length) {
        return false;
    }
    for (let i = 0; i < x.length; i++) {
        if (x[i].description !== y[i].description ||
            x[i].destructive !== y[i].destructive ||
            x[i].sql !== y[i].sql) {
            return false;
        }
    }
    return true;
}
function setSchemaValidationMode(schema, schemaValidation) {
    const postgresDatasource = schema.datasources.find((d) => d.postgresql);
    if (postgresDatasource === null || postgresDatasource === void 0 ? void 0 : postgresDatasource.postgresql) {
        postgresDatasource.postgresql.schemaValidation = schemaValidation;
    }
}
function getIdentifiers(schema) {
    var _a, _b, _c;
    const postgresDatasource = schema.datasources.find((d) => d.postgresql);
    const databaseId = (_a = postgresDatasource === null || postgresDatasource === void 0 ? void 0 : postgresDatasource.postgresql) === null || _a === void 0 ? void 0 : _a.database;
    if (!databaseId) {
        throw new error_1.FirebaseError("Data Connect schema must have a postgres datasource with a database name.");
    }
    const instanceName = (_c = (_b = postgresDatasource === null || postgresDatasource === void 0 ? void 0 : postgresDatasource.postgresql) === null || _b === void 0 ? void 0 : _b.cloudSql) === null || _c === void 0 ? void 0 : _c.instance;
    if (!instanceName) {
        throw new error_1.FirebaseError("Data Connect schema must have a postgres datasource with a CloudSQL instance.");
    }
    const instanceId = instanceName.split("/").pop();
    const serviceName = schema.name.replace(`/schemas/${types_1.SCHEMA_ID}`, "");
    return {
        databaseId,
        instanceId,
        instanceName,
        serviceName,
    };
}
exports.getIdentifiers = getIdentifiers;
function suggestedCommand(serviceName, invalidConnectorNames) {
    const serviceId = serviceName.split("/")[5];
    const connectorIds = invalidConnectorNames.map((i) => i.split("/")[7]);
    const onlys = connectorIds.map((c) => `dataconnect:${serviceId}:${c}`).join(",");
    return `firebase deploy --only ${onlys}`;
}
async function handleIncompatibleSchemaError(args) {
    const { incompatibleSchemaError, options, instanceId, databaseId, choice } = args;
    const commandsToExecute = incompatibleSchemaError.diffs.filter((d) => {
        switch (choice) {
            case "all":
                return true;
            case "safe":
                return !d.destructive;
            case "none":
                return false;
        }
    });
    if (commandsToExecute.length) {
        const commandsToExecuteBySuperUser = commandsToExecute.filter(requireSuperUser);
        const commandsToExecuteByOwner = commandsToExecute.filter((sql) => !requireSuperUser(sql));
        const userIsCSQLAdmin = await (0, cloudsqladmin_1.iamUserIsCSQLAdmin)(options);
        if (!userIsCSQLAdmin && commandsToExecuteBySuperUser.length) {
            throw new error_1.FirebaseError(`Some SQL commands required for this migration require Admin permissions.\n 
        Please ask a user with 'roles/cloudsql.admin' to apply the following commands.\n
        ${diffsToString(commandsToExecuteBySuperUser)}`);
        }
        const schemaInfo = await (0, permissionsSetup_1.getSchemaMetadata)(instanceId, databaseId, permissions_1.DEFAULT_SCHEMA, options);
        if (schemaInfo.setupStatus !== permissionsSetup_1.SchemaSetupStatus.GreenField) {
            throw new error_1.FirebaseError(`Brownfield database are protected from SQL changes by Data Connect.\n` +
                `You can use the SQL diff generated by 'firebase dataconnect:sql:diff' to assist you in applying the required changes to your CloudSQL database. Connector deployment will succeed when there is no required diff changes.\n` +
                `If you would like Data Connect to manage your database schema, run 'firebase dataconnect:sql:setup'`);
        }
        // Test if iam user has access to the roles required for this migration
        if (!(await (0, permissionsSetup_1.checkSQLRoleIsGranted)(options, instanceId, databaseId, (0, permissions_1.firebaseowner)(databaseId), (await (0, connect_1.getIAMUser)(options)).user))) {
            if (!userIsCSQLAdmin) {
                throw new error_1.FirebaseError(`Command aborted. Only users granted firebaseowner SQL role can run migrations.`);
            }
            const account = (await (0, requireAuth_1.requireAuth)(options));
            (0, utils_1.logLabeledBullet)("dataconnect", `Granting firebaseowner role to myself ${account}...`);
            await (0, permissionsSetup_1.grantRoleTo)(options, instanceId, databaseId, "owner", account);
        }
        if (commandsToExecuteBySuperUser.length) {
            (0, utils_1.logLabeledBullet)("dataconnect", `Executing admin SQL commands as superuser...`);
            await (0, connect_1.executeSqlCmdsAsSuperUser)(options, instanceId, databaseId, commandsToExecuteBySuperUser.map((d) => d.sql), 
            /** silent=*/ false);
        }
        if (commandsToExecuteByOwner.length) {
            await (0, connect_1.executeSqlCmdsAsIamUser)(options, instanceId, databaseId, [`SET ROLE "${(0, permissions_1.firebaseowner)(databaseId)}"`, ...commandsToExecuteByOwner.map((d) => d.sql)], 
            /** silent=*/ false);
            return incompatibleSchemaError.diffs;
        }
    }
    return [];
}
async function promptForSchemaMigration(options, instanceId, databaseId, err, validateOnly, validationMode) {
    if (!err) {
        return "none";
    }
    const defaultChoice = validationMode === "STRICT_AFTER_COMPATIBLE" ? "none" : "all";
    displaySchemaChanges(err, validationMode);
    if (!options.nonInteractive) {
        if (validateOnly && options.force) {
            // `firebase dataconnect:sql:migrate --force` performs all compatible migrations.
            return defaultChoice;
        }
        let choices = [
            { name: "Execute all", value: "all" },
        ];
        if (err.destructive) {
            choices = [{ name: `Execute all ${clc.red("(including destructive)")}`, value: "all" }];
            // Add the "safe only" option if at least one non-destructive change exists.
            if (err.diffs.some((d) => !d.destructive)) {
                choices.push({ name: "Execute safe only", value: "safe" });
            }
        }
        if (validationMode === "STRICT_AFTER_COMPATIBLE") {
            choices.push({ name: "Skip them", value: "none" });
        }
        else {
            choices.push({ name: "Abort", value: "abort" });
        }
        const ans = await (0, prompt_1.select)({
            message: `Do you want to execute these SQL against ${instanceId}:${databaseId}?`,
            choices: choices,
            default: defaultChoice,
        });
        if (ans === "abort") {
            throw new error_1.FirebaseError("Command aborted.");
        }
        return ans;
    }
    if (!validateOnly) {
        // `firebase deploy --nonInteractive` performs no migrations
        throw new error_1.FirebaseError("Command aborted. Your database schema is incompatible with your Data Connect schema. Run `firebase dataconnect:sql:migrate` to migrate your database schema");
    }
    else if (options.force) {
        // `dataconnect:sql:migrate --nonInteractive --force` performs all migrations.
        return defaultChoice;
    }
    else if (!err.destructive) {
        // `dataconnect:sql:migrate --nonInteractive` performs only non-destructive migrations.
        return defaultChoice;
    }
    else {
        // `dataconnect:sql:migrate --nonInteractive` errors out if there are destructive migrations
        throw new error_1.FirebaseError("Command aborted. This schema migration includes potentially destructive changes. If you'd like to execute it anyway, rerun this command with --force");
    }
}
async function promptForInvalidConnectorError(options, serviceName, invalidConnectors, validateOnly) {
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
    if (!options.nonInteractive &&
        (await (0, prompt_1.confirm)(Object.assign(Object.assign({}, options), { message: `Would you like to delete and recreate these connectors? This will cause ${clc.red(`downtime`)}.` })))) {
        return true;
    }
    const cmd = suggestedCommand(serviceName, invalidConnectors);
    throw new error_1.FirebaseError(`Command aborted. Try deploying those connectors first with ${clc.bold(cmd)}`);
}
async function deleteInvalidConnectors(invalidConnectors) {
    return Promise.all(invalidConnectors.map(client_1.deleteConnector));
}
function displayInvalidConnectors(invalidConnectors) {
    const connectorIds = invalidConnectors.map((i) => i.split("/").pop()).join(", ");
    (0, utils_1.logLabeledWarning)("dataconnect", `The schema you are deploying is incompatible with the following existing connectors: ${clc.bold(connectorIds)}.`);
    (0, utils_1.logLabeledWarning)("dataconnect", `This is a ${clc.red("breaking")} change and may break existing apps.`);
}
/**
 * If the FDC service has never connected to the Cloud SQL instance (ephemeral=false),
 * the backend will not have the necessary permissions to check CSQL for differences.
 *
 * This method makes a best-effort attempt to build the connectivity.
 * We fix this by upserting the currently deployed schema with schemaValidation=strict,
 */
async function ensureServiceIsConnectedToCloudSql(serviceName, instanceName, databaseId, linkIfNotConnected) {
    var _a, _b, _c, _d;
    let currentSchema = await (0, client_1.getSchema)(serviceName);
    let postgresql = (_b = (_a = currentSchema === null || currentSchema === void 0 ? void 0 : currentSchema.datasources) === null || _a === void 0 ? void 0 : _a.find((d) => d.postgresql)) === null || _b === void 0 ? void 0 : _b.postgresql;
    if ((currentSchema === null || currentSchema === void 0 ? void 0 : currentSchema.reconciling) && // active LRO
        (
        // Cloud SQL instance is specified (but not connected)
        postgresql === null || postgresql === void 0 ? void 0 : postgresql.ephemeral) &&
        ((_c = postgresql === null || postgresql === void 0 ? void 0 : postgresql.cloudSql) === null || _c === void 0 ? void 0 : _c.instance) &&
        (postgresql === null || postgresql === void 0 ? void 0 : postgresql.schemaValidation) === "NONE") {
        // [SPECIAL CASE] There is an UpdateSchema LRO waiting for Cloud SQL creation.
        // Error out early because if the next `UpdateSchema` request will get queued until Cloud SQL is created.
        const [, , , , , serviceId] = serviceName.split("/");
        const [, projectId, , , , instanceId] = postgresql.cloudSql.instance.split("/");
        throw new error_1.FirebaseError(`While checking the service ${serviceId}, ` + (0, provisionCloudSql_1.cloudSQLBeingCreated)(projectId, instanceId));
    }
    if (!currentSchema || !postgresql) {
        if (!linkIfNotConnected) {
            (0, utils_1.logLabeledWarning)("dataconnect", `Not yet linked to the Cloud SQL instance.`);
            return;
        }
        // TODO: make this prompt
        // Should we upsert service here as well? so `database:sql:migrate` work for new service as well.
        (0, utils_1.logLabeledBullet)("dataconnect", `Linking the Cloud SQL instance...`);
        // If no schema has been deployed yet, deploy an empty one to get connectivity.
        currentSchema = {
            name: `${serviceName}/schemas/${types_1.SCHEMA_ID}`,
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
        postgresql = currentSchema.datasources[0].postgresql;
    }
    let alreadyConnected = !postgresql.ephemeral || false;
    if (((_d = postgresql.cloudSql) === null || _d === void 0 ? void 0 : _d.instance) && postgresql.cloudSql.instance !== instanceName) {
        alreadyConnected = false;
        (0, utils_1.logLabeledWarning)("dataconnect", `Switching connected Cloud SQL instance\n From ${postgresql.cloudSql.instance}\n To ${instanceName}`);
    }
    if (postgresql.database && postgresql.database !== databaseId) {
        alreadyConnected = false;
        (0, utils_1.logLabeledWarning)("dataconnect", `Switching connected Postgres database from ${postgresql.database} to ${databaseId}`);
    }
    if (alreadyConnected) {
        // Skip provisioning connectivity if FDC backend has already connected to this Cloud SQL instance.
        return;
    }
    try {
        postgresql.schemaValidation = "STRICT";
        postgresql.database = databaseId;
        postgresql.cloudSql = { instance: instanceName };
        await (0, client_1.upsertSchema)(currentSchema, /** validateOnly=*/ false);
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.status) >= 500) {
            throw err;
        }
        logger_1.logger.debug(`Failed to ensure service is connected to Cloud SQL: ${err.message}`);
    }
}
exports.ensureServiceIsConnectedToCloudSql = ensureServiceIsConnectedToCloudSql;
function displayStartSchemaDiff(validationMode) {
    switch (validationMode) {
        case "COMPATIBLE":
            (0, utils_1.logLabeledBullet)("dataconnect", `Generating SQL schema migrations to be compatible...`);
            break;
        case "STRICT":
            (0, utils_1.logLabeledBullet)("dataconnect", `Generating SQL schema migrations to match exactly...`);
            break;
    }
}
function displayNoSchemaDiff(instanceId, databaseId, validationMode) {
    switch (validationMode) {
        case "COMPATIBLE":
            (0, utils_1.logLabeledSuccess)("dataconnect", `Database schema of ${instanceId}:${databaseId} is compatible with Data Connect Schema.`);
            break;
        case "STRICT":
            (0, utils_1.logLabeledSuccess)("dataconnect", `Database schema of ${instanceId}:${databaseId} matches Data Connect Schema exactly.`);
            break;
    }
}
function displaySchemaChanges(error, validationMode) {
    switch (error.violationType) {
        case "INCOMPATIBLE_SCHEMA":
            {
                switch (validationMode) {
                    case "COMPATIBLE":
                        (0, utils_1.logLabeledWarning)("dataconnect", `PostgreSQL schema is incompatible with the Data Connect Schema.
Those SQL statements will migrate it to be compatible:

${diffsToString(error.diffs)}
`);
                        break;
                    case "STRICT_AFTER_COMPATIBLE":
                        (0, utils_1.logLabeledBullet)("dataconnect", `PostgreSQL schema contains unused SQL objects not part of the Data Connect Schema.
Those SQL statements will migrate it to match exactly:

${diffsToString(error.diffs)}
`);
                        break;
                    case "STRICT":
                        (0, utils_1.logLabeledWarning)("dataconnect", `PostgreSQL schema does not match the Data Connect Schema.
Those SQL statements will migrate it to match exactly:

${diffsToString(error.diffs)}
`);
                        break;
                }
            }
            break;
        case "INACCESSIBLE_SCHEMA":
            {
                (0, utils_1.logLabeledWarning)("dataconnect", `Cannot access CloudSQL database to validate schema.
Here is the complete expected SQL schema:
${diffsToString(error.diffs)}
`);
                (0, utils_1.logLabeledWarning)("dataconnect", "Some SQL resources may already exist.");
            }
            break;
        default:
            throw new error_1.FirebaseError(`Unknown schema violation type: ${error.violationType}, IncompatibleSqlSchemaError: ${error}`);
    }
}
function requireSuperUser(diff) {
    return diff.sql.startsWith("CREATE EXTENSION") || diff.sql.startsWith("CREATE SCHEMA");
}
function diffsToString(diffs) {
    return diffs.map(diffToString).join("\n\n");
}
function diffToString(diff) {
    return `\/** ${diff.destructive ? clc.red("Destructive: ") : ""}${diff.description}*\/\n${(0, sql_formatter_1.format)(diff.sql, { language: "postgresql" })}`;
}
