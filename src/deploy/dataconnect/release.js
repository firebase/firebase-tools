"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils = __importStar(require("../../utils"));
const client_1 = require("../../dataconnect/client");
const prompts_1 = require("../../dataconnect/prompts");
const schemaMigration_1 = require("../../dataconnect/schemaMigration");
const projectUtils_1 = require("../../projectUtils");
const names_1 = require("../../dataconnect/names");
const logger_1 = require("../../logger");
/**
 * Release deploys schemas and connectors.
 * TODO: Also prompt user to delete unused schemas/connectors
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function default_1(context, options) {
    const project = (0, projectUtils_1.needProjectId)(options);
    const serviceInfos = context.dataconnect.serviceInfos;
    const filters = context.dataconnect.filters;
    // First, figure out the schemas and connectors to deploy.
    const wantSchemas = serviceInfos
        .filter((si) => {
        return (!filters ||
            filters.some((f) => {
                return f.serviceId === si.dataConnectYaml.serviceId && (f.schemaOnly || f.fullService);
            }));
    })
        .map((s) => ({
        schema: s.schema,
        validationMode: s.dataConnectYaml?.schema?.datasource?.postgresql?.schemaValidation,
    }));
    const wantConnectors = serviceInfos.flatMap((si) => si.connectorInfo
        .filter((c) => {
        return (!filters ||
            filters.some((f) => {
                return (f.serviceId === si.dataConnectYaml.serviceId &&
                    (f.connectorId === c.connectorYaml.connectorId || f.fullService));
            }));
    })
        .map((c) => c.connector));
    // Pre-deploy all connectors on the previous schema.
    // If connectors don't rely on capabilities in the new schema, they will succeed.
    // The remaining connectors will be deployed after schema migration.
    const remainingConnectors = await Promise.all(wantConnectors.map(async (c) => {
        try {
            await (0, client_1.upsertConnector)(c);
        }
        catch (err) {
            logger_1.logger.debug("Error pre-deploying connector", c.name, err);
            return c; // will try again after schema deployment.
        }
        utils.logLabeledSuccess("dataconnect", `Deployed connector ${c.name}`);
        return undefined;
    }));
    // Migrate schemas.
    for (const s of wantSchemas) {
        await (0, schemaMigration_1.migrateSchema)({
            options,
            schema: s.schema,
            validateOnly: false,
            schemaValidation: s.validationMode,
        });
        utils.logLabeledSuccess("dataconnect", `Migrated schema ${s.schema.name}`);
    }
    // Lastly, deploy the remaining connectors that relies on the latest schema.
    await Promise.all(remainingConnectors.map(async (c) => {
        if (c) {
            await (0, client_1.upsertConnector)(c);
            utils.logLabeledSuccess("dataconnect", `Deployed connector ${c.name}`);
        }
    }));
    // In the end, check for connectors not tracked in local repositories.
    const allConnectors = await deployedConnectors(serviceInfos);
    const connectorsToDelete = filters
        ? []
        : allConnectors.filter((h) => !wantConnectors.some((w) => w.name === h.name));
    for (const c of connectorsToDelete) {
        await (0, prompts_1.promptDeleteConnector)(options, c.name);
    }
    // Print the Console link.
    let consolePath = "/dataconnect";
    if (serviceInfos.length === 1) {
        const sn = (0, names_1.parseServiceName)(serviceInfos[0].serviceName);
        consolePath += `/locations/${sn.location}/services/${sn.serviceId}/schema`;
    }
    utils.logLabeledSuccess("dataconnect", `Deployment complete! View your deployed schema and connectors at

    ${utils.consoleUrl(project, consolePath)}
`);
    return;
}
exports.default = default_1;
// deployedConnectors lists out all of the connectors currently deployed to the services we are deploying.
// We don't need to worry about connectors on other services because we will delete/ignore the service during deploy
async function deployedConnectors(serviceInfos) {
    let connectors = [];
    for (const si of serviceInfos) {
        connectors = connectors.concat(await (0, client_1.listConnectors)(si.serviceName));
    }
    return connectors;
}
//# sourceMappingURL=release.js.map