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
const client = __importStar(require("../../dataconnect/client"));
const utils = __importStar(require("../../utils"));
const types_1 = require("../../dataconnect/types");
const projectUtils_1 = require("../../projectUtils");
const provisionCloudSql_1 = require("../../dataconnect/provisionCloudSql");
const names_1 = require("../../dataconnect/names");
const api_1 = require("../../api");
const ensureApiEnabled = __importStar(require("../../ensureApiEnabled"));
const prompt_1 = require("../../prompt");
/**
 * Checks for and creates a Firebase DataConnect service, if needed.
 * TODO: Also checks for and creates a CloudSQL instance and database.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function default_1(context, options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const serviceInfos = context.dataconnect.serviceInfos;
    const services = await client.listAllServices(projectId);
    const filters = context.dataconnect.filters;
    if (serviceInfos.some((si) => {
        return (0, types_1.requiresVector)(si.deploymentMetadata);
    })) {
        await ensureApiEnabled.ensure(projectId, (0, api_1.vertexAIOrigin)(), "dataconnect");
    }
    const servicesToCreate = serviceInfos
        .filter((si) => !services.some((s) => matches(si, s)))
        .filter((si) => {
        return !filters || filters?.some((f) => si.dataConnectYaml.serviceId === f.serviceId);
    });
    const servicesToDelete = filters
        ? []
        : services.filter((s) => !serviceInfos.some((si) => matches(si, s)));
    await Promise.all(servicesToCreate.map(async (s) => {
        const { projectId, locationId, serviceId } = splitName(s.serviceName);
        await client.createService(projectId, locationId, serviceId);
        utils.logLabeledSuccess("dataconnect", `Created service ${s.serviceName}`);
    }));
    if (servicesToDelete.length) {
        const serviceToDeleteList = servicesToDelete.map((s) => " - " + s.name).join("\n");
        if (await (0, prompt_1.confirm)({
            force: false,
            nonInteractive: options.nonInteractive,
            message: `The following services exist on ${projectId} but are not listed in your 'firebase.json'\n${serviceToDeleteList}\nWould you like to delete these services?`,
            default: false,
        })) {
            await Promise.all(servicesToDelete.map(async (s) => {
                await client.deleteService(s.name);
                utils.logLabeledSuccess("dataconnect", `Deleted service ${s.name}`);
            }));
        }
    }
    // Provision CloudSQL resources
    utils.logLabeledBullet("dataconnect", "Checking for CloudSQL resources...");
    await Promise.all(serviceInfos
        .filter((si) => {
        return !filters || filters?.some((f) => si.dataConnectYaml.serviceId === f.serviceId);
    })
        .map(async (s) => {
        const postgresDatasource = s.schema.datasources.find((d) => d.postgresql);
        if (postgresDatasource) {
            const instanceId = postgresDatasource.postgresql?.cloudSql?.instance.split("/").pop();
            const databaseId = postgresDatasource.postgresql?.database;
            if (!instanceId || !databaseId) {
                return Promise.resolve();
            }
            return (0, provisionCloudSql_1.setupCloudSql)({
                projectId,
                location: (0, names_1.parseServiceName)(s.serviceName).location,
                instanceId,
                databaseId,
                requireGoogleMlIntegration: (0, types_1.requiresVector)(s.deploymentMetadata),
            });
        }
    }));
    return;
}
exports.default = default_1;
function matches(si, s) {
    return si.serviceName === s.name;
}
function splitName(serviceName) {
    const parts = serviceName.split("/");
    return {
        projectId: parts[1],
        locationId: parts[3],
        serviceId: parts[5],
    };
}
//# sourceMappingURL=deploy.js.map