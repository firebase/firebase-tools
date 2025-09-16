"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newUniqueId = exports.toDNSCompatibleId = exports.actuate = exports.askQuestions = void 0;
const path_1 = require("path");
const clc = require("colorette");
const fs = require("fs-extra");
const prompt_1 = require("../../../prompt");
const provisionCloudSql_1 = require("../../../dataconnect/provisionCloudSql");
const freeTrial_1 = require("../../../dataconnect/freeTrial");
const cloudsql = require("../../../gcp/cloudsql/cloudsqladmin");
const ensureApis_1 = require("../../../dataconnect/ensureApis");
const client_1 = require("../../../dataconnect/client");
const types_1 = require("../../../dataconnect/types");
const names_1 = require("../../../dataconnect/names");
const logger_1 = require("../../../logger");
const templates_1 = require("../../../templates");
const utils_1 = require("../../../utils");
Object.defineProperty(exports, "newUniqueId", { enumerable: true, get: function () { return utils_1.newUniqueId; } });
const cloudbilling_1 = require("../../../gcp/cloudbilling");
const sdk = require("./sdk");
const fdcExperience_1 = require("../../../gemini/fdcExperience");
const configstore_1 = require("../../../configstore");
const track_1 = require("../../../track");
const DATACONNECT_YAML_TEMPLATE = (0, templates_1.readTemplateSync)("init/dataconnect/dataconnect.yaml");
const CONNECTOR_YAML_TEMPLATE = (0, templates_1.readTemplateSync)("init/dataconnect/connector.yaml");
const SCHEMA_TEMPLATE = (0, templates_1.readTemplateSync)("init/dataconnect/schema.gql");
const QUERIES_TEMPLATE = (0, templates_1.readTemplateSync)("init/dataconnect/queries.gql");
const MUTATIONS_TEMPLATE = (0, templates_1.readTemplateSync)("init/dataconnect/mutations.gql");
const templateServiceInfo = {
    schemaGql: [{ path: "schema.gql", content: SCHEMA_TEMPLATE }],
    connectors: [
        {
            id: "example",
            path: "./example",
            files: [
                {
                    path: "queries.gql",
                    content: QUERIES_TEMPLATE,
                },
                {
                    path: "mutations.gql",
                    content: MUTATIONS_TEMPLATE,
                },
            ],
        },
    ],
};
// askQuestions prompts the user about the Data Connect service they want to init. Any prompting
// logic should live here, and _no_ actuation logic should live here.
async function askQuestions(setup) {
    const info = {
        analyticsFlow: "cli",
        appDescription: "",
        serviceId: "",
        locationId: "",
        cloudSqlInstanceId: "",
        cloudSqlDatabase: "",
        shouldProvisionCSQL: false,
    };
    if (setup.projectId) {
        const hasBilling = await (0, cloudbilling_1.isBillingEnabled)(setup);
        await (0, ensureApis_1.ensureApis)(setup.projectId);
        await promptForExistingServices(setup, info);
        if (!info.serviceGql) {
            // TODO: Consider use Gemini to generate schema for Spark project as well.
            if (!configstore_1.configstore.get("gemini")) {
                (0, utils_1.logBullet)("Learn more about Gemini in Firebase and how it uses your data: https://firebase.google.com/docs/gemini-in-firebase#how-gemini-in-firebase-uses-your-data");
            }
            info.appDescription = await (0, prompt_1.input)({
                message: `Describe your app to automatically generate a schema with Gemini [Enter to skip]:`,
            });
            if (info.appDescription) {
                configstore_1.configstore.set("gemini", true);
                await (0, ensureApis_1.ensureGIFApis)(setup.projectId);
            }
        }
        if (hasBilling) {
            await promptForCloudSQL(setup, info);
        }
    }
    setup.featureInfo = setup.featureInfo || {};
    setup.featureInfo.dataconnect = info;
    await sdk.askQuestions(setup);
}
exports.askQuestions = askQuestions;
// actuate writes product specific files and makes product specifc API calls.
// It does not handle writing firebase.json and .firebaserc
async function actuate(setup, config, options) {
    var _a;
    // Most users will want to persist data between emulator runs, so set this to a reasonable default.
    const dir = config.get("dataconnect.source", "dataconnect");
    const dataDir = config.get("emulators.dataconnect.dataDir", `${dir}/.dataconnect/pgliteData`);
    config.set("emulators.dataconnect.dataDir", dataDir);
    const info = (_a = setup.featureInfo) === null || _a === void 0 ? void 0 : _a.dataconnect;
    if (!info) {
        throw new Error("Data Connect feature RequiredInfo is not provided");
    }
    // Populate the default values of required fields.
    info.serviceId = info.serviceId || defaultServiceId();
    info.cloudSqlInstanceId = info.cloudSqlInstanceId || `${info.serviceId.toLowerCase()}-fdc`;
    info.locationId = info.locationId || `us-central1`;
    info.cloudSqlDatabase = info.cloudSqlDatabase || `fdcdb`;
    try {
        await actuateWithInfo(setup, config, info, options);
        await sdk.actuate(setup, config);
    }
    finally {
        void (0, track_1.trackGA4)("dataconnect_init", {
            project_status: setup.projectId ? (setup.isBillingEnabled ? "blaze" : "spark") : "missing",
            flow: info.analyticsFlow,
            provision_cloud_sql: String(info.shouldProvisionCSQL),
        });
    }
    if (info.appDescription) {
        setup.instructions.push(`You can visualize the Data Connect Schema in Firebase Console:

    https://console.firebase.google.com/project/${setup.projectId}/dataconnect/locations/${info.locationId}/services/${info.serviceId}/schema`);
    }
    if (!setup.isBillingEnabled) {
        setup.instructions.push((0, freeTrial_1.upgradeInstructions)(setup.projectId || "your-firebase-project"));
    }
    setup.instructions.push(`Install the Data Connect VS Code Extensions. You can explore Data Connect Query on local pgLite and Cloud SQL Postgres Instance.`);
}
exports.actuate = actuate;
async function actuateWithInfo(setup, config, info, options) {
    const projectId = setup.projectId;
    if (!projectId) {
        // If no project is present, just save the template files.
        info.analyticsFlow += "_save_template";
        return await writeFiles(config, info, templateServiceInfo, options);
    }
    await (0, ensureApis_1.ensureApis)(projectId, /* silent =*/ true);
    const provisionCSQL = info.shouldProvisionCSQL && (await (0, cloudbilling_1.isBillingEnabled)(setup));
    if (provisionCSQL) {
        // Kicks off Cloud SQL provisioning if the project has billing enabled.
        await (0, provisionCloudSql_1.setupCloudSql)({
            projectId: projectId,
            location: info.locationId,
            instanceId: info.cloudSqlInstanceId,
            databaseId: info.cloudSqlDatabase,
            requireGoogleMlIntegration: false,
        });
    }
    const serviceName = `projects/${projectId}/locations/${info.locationId}/services/${info.serviceId}`;
    if (!info.appDescription) {
        if (!info.serviceGql) {
            // Try download the existing service if it exists.
            // MCP tool `firebase_init` may setup an existing service.
            await downloadService(info, serviceName);
        }
        if (info.serviceGql) {
            // Save the downloaded service from the backend.
            info.analyticsFlow += "_save_downloaded";
            return await writeFiles(config, info, info.serviceGql, options);
        }
        // Use the static template if it starts from scratch or the existing service has no GQL source.
        info.analyticsFlow += "_save_template";
        return await writeFiles(config, info, templateServiceInfo, options);
    }
    const serviceAlreadyExists = !(await (0, client_1.createService)(projectId, info.locationId, info.serviceId));
    // Use Gemini to generate schema.
    const schemaGql = await (0, utils_1.promiseWithSpinner)(() => (0, fdcExperience_1.generateSchema)(info.appDescription, projectId), "Generating the Data Connect Schema...");
    const schemaFiles = [{ path: "schema.gql", content: schemaGql }];
    if (serviceAlreadyExists) {
        // If the service already exists, fallback to save only the generated schema.
        // Later customer can run `firebase deploy` to override the existing service.
        //
        // - CLI cmd `firebase init dataconnect` always picks a new service ID, so it should never hit this case.
        // - MCP tool `firebase_init` may pick an existing service ID, but shouldn't set app_description at the same time.
        (0, utils_1.logLabeledError)("dataconnect", `Data Connect Service ${serviceName} already exists. Skip saving them...`);
        info.analyticsFlow += "_save_gemini_service_already_exists";
        return await writeFiles(config, info, { schemaGql: schemaFiles, connectors: [] }, options);
    }
    // Create the initial Data Connect Service and Schema generated by Gemini.
    await (0, utils_1.promiseWithSpinner)(async () => {
        const [saveSchemaGql, waitForCloudSQLProvision] = schemasDeploySequence(projectId, info, schemaFiles, provisionCSQL);
        await (0, client_1.upsertSchema)(saveSchemaGql);
        if (waitForCloudSQLProvision) {
            // Kicks off the LRO in the background. It will take about 10min. Don't wait for it.
            void (0, client_1.upsertSchema)(waitForCloudSQLProvision);
        }
    }, "Saving the Data Connect Schema...");
    try {
        // Generate the example Data Connect Connector and seed_data.gql with Gemini.
        // Save them to local file, but don't deploy it because they may have errors.
        const [operationGql, seedDataGql] = await (0, utils_1.promiseWithSpinner)(() => Promise.all([
            (0, fdcExperience_1.generateOperation)(fdcExperience_1.PROMPT_GENERATE_CONNECTOR, serviceName, projectId),
            (0, fdcExperience_1.generateOperation)(fdcExperience_1.PROMPT_GENERATE_SEED_DATA, serviceName, projectId),
        ]), "Generating the Data Connect Operations...");
        const connectors = [
            {
                id: "example",
                path: "./example",
                files: [
                    {
                        path: "queries.gql",
                        content: operationGql,
                    },
                ],
            },
        ];
        info.analyticsFlow += "_save_gemini";
        await writeFiles(config, info, { schemaGql: schemaFiles, connectors: connectors, seedDataGql: seedDataGql }, options);
    }
    catch (err) {
        (0, utils_1.logLabeledError)("dataconnect", `Operation Generation failed...`);
        // GiF generate operation API has stability concerns.
        // Fallback to save only the generated schema.
        info.analyticsFlow += "_save_gemini_operation_error";
        await writeFiles(config, info, { schemaGql: schemaFiles, connectors: [] }, options);
        throw err;
    }
}
function schemasDeploySequence(projectId, info, schemaFiles, linkToCloudSql) {
    const serviceName = `projects/${projectId}/locations/${info.locationId}/services/${info.serviceId}`;
    if (!linkToCloudSql) {
        // No Cloud SQL is being provisioned, just deploy the schema sources as a unlinked schema.
        return [
            {
                name: `${serviceName}/schemas/${types_1.SCHEMA_ID}`,
                datasources: [{ postgresql: {} }],
                source: {
                    files: schemaFiles,
                },
            },
        ];
    }
    // Cloud SQL is being provisioned at the same time.
    // Persist the Cloud SQL schema associated with this FDC service, then start a LRO (`MIGRATE_COMPATIBLE`)
    // wait for Cloud SQL provision to finish and setup its initial SQL schemas.
    return [
        {
            name: `${serviceName}/schemas/${types_1.SCHEMA_ID}`,
            datasources: [
                {
                    postgresql: {
                        database: info.cloudSqlDatabase,
                        cloudSql: {
                            instance: `projects/${projectId}/locations/${info.locationId}/instances/${info.cloudSqlInstanceId}`,
                        },
                        schemaValidation: "NONE",
                    },
                },
            ],
            source: {
                files: schemaFiles,
            },
        },
        {
            name: `${serviceName}/schemas/${types_1.SCHEMA_ID}`,
            datasources: [
                {
                    postgresql: {
                        database: info.cloudSqlDatabase,
                        cloudSql: {
                            instance: `projects/${projectId}/locations/${info.locationId}/instances/${info.cloudSqlInstanceId}`,
                        },
                        schemaMigration: "MIGRATE_COMPATIBLE",
                    },
                },
            ],
            source: {
                files: schemaFiles,
            },
        },
    ];
}
async function writeFiles(config, info, serviceGql, options) {
    const dir = config.get("dataconnect.source") || "dataconnect";
    const subbedDataconnectYaml = subDataconnectYamlValues(Object.assign(Object.assign({}, info), { connectorDirs: serviceGql.connectors.map((c) => c.path) }));
    config.set("dataconnect", { source: dir });
    await config.askWriteProjectFile((0, path_1.join)(dir, "dataconnect.yaml"), subbedDataconnectYaml, !!options.force, 
    // Default to override dataconnect.yaml
    // Sole purpose of `firebase init dataconnect` is to update `dataconnect.yaml`.
    true);
    if (serviceGql.seedDataGql) {
        await config.askWriteProjectFile((0, path_1.join)(dir, "seed_data.gql"), serviceGql.seedDataGql, !!options.force);
    }
    if (serviceGql.schemaGql.length) {
        for (const f of serviceGql.schemaGql) {
            await config.askWriteProjectFile((0, path_1.join)(dir, "schema", f.path), f.content, !!options.force);
        }
    }
    else {
        // Even if the schema is empty, lets give them an empty .gql file to get started.
        fs.ensureFileSync((0, path_1.join)(dir, "schema", "schema.gql"));
    }
    for (const c of serviceGql.connectors) {
        await writeConnectorFiles(config, c, options);
    }
}
async function writeConnectorFiles(config, connectorInfo, options) {
    const subbedConnectorYaml = subConnectorYamlValues({ connectorId: connectorInfo.id });
    const dir = config.get("dataconnect.source") || "dataconnect";
    await config.askWriteProjectFile((0, path_1.join)(dir, connectorInfo.path, "connector.yaml"), subbedConnectorYaml, !!options.force, 
    // Default to override connector.yaml
    true);
    for (const f of connectorInfo.files) {
        await config.askWriteProjectFile((0, path_1.join)(dir, connectorInfo.path, f.path), f.content, !!options.force);
    }
}
function subDataconnectYamlValues(replacementValues) {
    const replacements = {
        serviceId: "__serviceId__",
        cloudSqlDatabase: "__cloudSqlDatabase__",
        cloudSqlInstanceId: "__cloudSqlInstanceId__",
        connectorDirs: "__connectorDirs__",
        locationId: "__location__",
    };
    let replaced = DATACONNECT_YAML_TEMPLATE;
    for (const [k, v] of Object.entries(replacementValues)) {
        replaced = replaced.replace(replacements[k], JSON.stringify(v));
    }
    return replaced;
}
function subConnectorYamlValues(replacementValues) {
    const replacements = {
        connectorId: "__connectorId__",
    };
    let replaced = CONNECTOR_YAML_TEMPLATE;
    for (const [k, v] of Object.entries(replacementValues)) {
        replaced = replaced.replace(replacements[k], JSON.stringify(v));
    }
    return replaced;
}
async function promptForExistingServices(setup, info) {
    // Check for existing Firebase Data Connect services.
    if (!setup.projectId) {
        return;
    }
    const existingServices = await (0, client_1.listAllServices)(setup.projectId);
    if (!existingServices.length) {
        return;
    }
    const choice = await chooseExistingService(existingServices);
    if (!choice) {
        const existingServiceIds = existingServices.map((s) => s.name.split("/").pop());
        info.serviceId = (0, utils_1.newUniqueId)(defaultServiceId(), existingServiceIds);
        info.analyticsFlow += "_pick_new_service";
        return;
    }
    // Choose to use an existing service.
    info.analyticsFlow += "_pick_existing_service";
    const serviceName = (0, names_1.parseServiceName)(choice.name);
    info.serviceId = serviceName.serviceId;
    info.locationId = serviceName.location;
    await downloadService(info, choice.name);
}
async function downloadService(info, serviceName) {
    var _a, _b, _c, _d, _e;
    const schema = await (0, client_1.getSchema)(serviceName);
    if (!schema) {
        return;
    }
    info.serviceGql = {
        schemaGql: [],
        connectors: [
            {
                id: "example",
                path: "./example",
                files: [],
            },
        ],
    };
    const primaryDatasource = schema.datasources.find((d) => d.postgresql);
    if ((_b = (_a = primaryDatasource === null || primaryDatasource === void 0 ? void 0 : primaryDatasource.postgresql) === null || _a === void 0 ? void 0 : _a.cloudSql) === null || _b === void 0 ? void 0 : _b.instance) {
        const instanceName = (0, names_1.parseCloudSQLInstanceName)(primaryDatasource.postgresql.cloudSql.instance);
        info.cloudSqlInstanceId = instanceName.instanceId;
    }
    if ((_c = schema.source.files) === null || _c === void 0 ? void 0 : _c.length) {
        info.serviceGql.schemaGql = schema.source.files;
    }
    info.cloudSqlDatabase = (_e = (_d = primaryDatasource === null || primaryDatasource === void 0 ? void 0 : primaryDatasource.postgresql) === null || _d === void 0 ? void 0 : _d.database) !== null && _e !== void 0 ? _e : "";
    const connectors = await (0, client_1.listConnectors)(serviceName, [
        "connectors.name",
        "connectors.source.files",
    ]);
    if (connectors.length) {
        info.serviceGql.connectors = connectors.map((c) => {
            const id = c.name.split("/").pop();
            return {
                id,
                path: connectors.length === 1 ? "./example" : `./${id}`,
                files: c.source.files || [],
            };
        });
    }
}
/**
 * Picks create new service or an existing service from the list of services.
 *
 * Firebase Console can provide `FDC_CONNECTOR` or `FDC_SERVICE` environment variable.
 * If either is present, chooseExistingService try to match it with any existing service
 * and short-circuit the prompt.
 *
 * `FDC_SERVICE` should have the format `<location>/<serviceId>`.
 * `FDC_CONNECTOR` should have the same `<location>/<serviceId>/<connectorId>`.
 * @param existing
 */
async function chooseExistingService(existing) {
    const fdcConnector = (0, utils_1.envOverride)("FDC_CONNECTOR", "");
    const fdcService = (0, utils_1.envOverride)("FDC_SERVICE", "");
    const serviceEnvVar = fdcConnector || fdcService;
    if (serviceEnvVar) {
        const [serviceLocationFromEnvVar, serviceIdFromEnvVar] = serviceEnvVar.split("/");
        const serviceFromEnvVar = existing.find((s) => {
            const serviceName = (0, names_1.parseServiceName)(s.name);
            return (serviceName.serviceId === serviceIdFromEnvVar &&
                serviceName.location === serviceLocationFromEnvVar);
        });
        if (serviceFromEnvVar) {
            (0, utils_1.logBullet)(`Picking up the existing service ${clc.bold(serviceLocationFromEnvVar + "/" + serviceIdFromEnvVar)}.`);
            return serviceFromEnvVar;
        }
        const envVarName = fdcConnector ? "FDC_CONNECTOR" : "FDC_SERVICE";
        (0, utils_1.logWarning)(`Unable to pick up an existing service based on ${envVarName}=${serviceEnvVar}.`);
    }
    const choices = existing.map((s) => {
        const serviceName = (0, names_1.parseServiceName)(s.name);
        return {
            name: `${serviceName.location}/${serviceName.serviceId}`,
            value: s,
        };
    });
    choices.push({ name: "Create a new service", value: undefined });
    return await (0, prompt_1.select)({
        message: "Your project already has existing services. Which would you like to set up local files for?",
        choices,
    });
}
async function promptForCloudSQL(setup, info) {
    if (!setup.projectId) {
        return;
    }
    // Check for existing Cloud SQL instances, if we didn't already set one.
    if (info.cloudSqlInstanceId === "") {
        const instances = await cloudsql.listInstances(setup.projectId);
        let choices = instances.map((i) => {
            var _a;
            let display = `${i.name} (${i.region})`;
            if (((_a = i.settings.userLabels) === null || _a === void 0 ? void 0 : _a["firebase-data-connect"]) === "ft") {
                display += " (no cost trial)";
            }
            return { name: display, value: i.name, location: i.region };
        });
        // If we've already chosen a region (ie service already exists), only list instances from that region.
        choices = choices.filter((c) => info.locationId === "" || info.locationId === c.location);
        if (choices.length) {
            if (!(await (0, freeTrial_1.checkFreeTrialInstanceUsed)(setup.projectId))) {
                choices.push({ name: "Create a new free trial instance", value: "", location: "" });
            }
            else {
                choices.push({ name: "Create a new CloudSQL instance", value: "", location: "" });
            }
            info.cloudSqlInstanceId = await (0, prompt_1.select)({
                message: `Which CloudSQL instance would you like to use?`,
                choices,
            });
            if (info.cloudSqlInstanceId !== "") {
                info.analyticsFlow += "_pick_existing_csql";
                // Infer location if a CloudSQL instance is chosen.
                info.locationId = choices.find((c) => c.value === info.cloudSqlInstanceId).location;
            }
            else {
                info.analyticsFlow += "_pick_new_csql";
                info.cloudSqlInstanceId = await (0, prompt_1.input)({
                    message: `What ID would you like to use for your new CloudSQL instance?`,
                    default: (0, utils_1.newUniqueId)(`${defaultServiceId().toLowerCase()}-fdc`, instances.map((i) => i.name)),
                });
            }
        }
    }
    if (info.locationId === "") {
        const choices = await locationChoices(setup);
        info.locationId = await (0, prompt_1.select)({
            message: "What location would like to use?",
            choices,
            default: "us-central1",
        });
        info.shouldProvisionCSQL = await (0, prompt_1.confirm)({
            message: `Would you like to provision your Cloud SQL instance and database now?`,
            default: true,
        });
    }
    // The Gemini generated schema will override any SQL schema in this Postgres database.
    // To avoid accidental data loss, we pick a new database ID if `listDatabases` is available.
    if (info.cloudSqlInstanceId !== "" && info.cloudSqlDatabase === "") {
        try {
            const dbs = await cloudsql.listDatabases(setup.projectId, info.cloudSqlInstanceId);
            const existing = dbs.map((d) => d.name);
            info.cloudSqlDatabase = (0, utils_1.newUniqueId)("fdcdb", existing);
        }
        catch (err) {
            // Show existing databases in a list is optional, ignore any errors from ListDatabases.
            // This often happen when the Cloud SQL instance is still being created.
            logger_1.logger.debug(`[dataconnect] Cannot list databases during init: ${err}`);
        }
    }
    return;
}
async function locationChoices(setup) {
    if (setup.projectId) {
        const locations = await (0, client_1.listLocations)(setup.projectId);
        return locations.map((l) => {
            return { name: l, value: l };
        });
    }
    else {
        // Hardcoded locations for when there is no project set up.
        return [
            { name: "us-central1", value: "us-central1" },
            { name: "europe-north1", value: "europe-north1" },
            { name: "europe-central2", value: "europe-central2" },
            { name: "europe-west1", value: "europe-west1" },
            { name: "southamerica-west1", value: "southamerica-west1" },
            { name: "us-east4", value: "us-east4" },
            { name: "us-west1", value: "us-west1" },
            { name: "asia-southeast1", value: "asia-southeast1" },
        ];
    }
}
function defaultServiceId() {
    return toDNSCompatibleId((0, path_1.basename)(process.cwd()));
}
/**
 * Converts any string to a DNS friendly service ID.
 */
function toDNSCompatibleId(id) {
    id = (0, path_1.basename)(id)
        .toLowerCase()
        .replaceAll(/[^a-z0-9-]/g, "")
        .slice(0, 63);
    while (id.endsWith("-") && id.length) {
        id = id.slice(0, id.length - 1);
    }
    while (id.startsWith("-") && id.length) {
        id = id.slice(1, id.length);
    }
    return id || "app";
}
exports.toDNSCompatibleId = toDNSCompatibleId;
