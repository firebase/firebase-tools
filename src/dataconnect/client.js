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
exports.upsertConnector = exports.listConnectors = exports.deleteConnector = exports.getConnector = exports.deleteSchema = exports.upsertSchema = exports.listSchemas = exports.getSchema = exports.deleteService = exports.createService = exports.listAllServices = exports.getService = exports.listLocations = void 0;
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const operationPoller = __importStar(require("../operation-poller"));
const types = __importStar(require("./types"));
const DATACONNECT_API_VERSION = "v1";
const PAGE_SIZE_MAX = 100;
const dataconnectClient = () => new apiv2_1.Client({
    urlPrefix: (0, api_1.dataconnectOrigin)(),
    apiVersion: DATACONNECT_API_VERSION,
    auth: true,
});
async function listLocations(projectId) {
    const res = await dataconnectClient().get(`/projects/${projectId}/locations`);
    return res.body?.locations?.map((l) => l.locationId) ?? [];
}
exports.listLocations = listLocations;
/** Service methods */
async function getService(serviceName) {
    const res = await dataconnectClient().get(serviceName);
    return res.body;
}
exports.getService = getService;
async function listAllServices(projectId) {
    const res = await dataconnectClient().get(`/projects/${projectId}/locations/-/services`);
    return res.body.services ?? [];
}
exports.listAllServices = listAllServices;
async function createService(projectId, locationId, serviceId) {
    try {
        const op = await dataconnectClient().post(`/projects/${projectId}/locations/${locationId}/services`, {
            name: `projects/${projectId}/locations/${locationId}/services/${serviceId}`,
        }, {
            queryParams: {
                service_id: serviceId,
            },
        });
        const pollRes = await operationPoller.pollOperation({
            apiOrigin: (0, api_1.dataconnectOrigin)(),
            apiVersion: DATACONNECT_API_VERSION,
            operationResourceName: op.body.name,
        });
        return pollRes;
    }
    catch (err) {
        if (err.status !== 409) {
            throw err;
        }
        return undefined; // Service already exists
    }
}
exports.createService = createService;
async function deleteService(serviceName) {
    // Note that we need to force delete in order to delete child resources too.
    const op = await dataconnectClient().delete(serviceName, {
        queryParams: { force: "true" },
    });
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.dataconnectOrigin)(),
        apiVersion: DATACONNECT_API_VERSION,
        operationResourceName: op.body.name,
    });
    return pollRes;
}
exports.deleteService = deleteService;
/** Schema methods */
async function getSchema(serviceName) {
    try {
        const res = await dataconnectClient().get(`${serviceName}/schemas/${types.SCHEMA_ID}`);
        return res.body;
    }
    catch (err) {
        if (err.status !== 404) {
            throw err;
        }
        return undefined;
    }
}
exports.getSchema = getSchema;
async function listSchemas(serviceName, fields = []) {
    const schemas = [];
    const getNextPage = async (pageToken = "") => {
        const res = await dataconnectClient().get(`${serviceName}/schemas`, {
            queryParams: {
                pageSize: PAGE_SIZE_MAX,
                pageToken,
                fields: fields.join(","),
            },
        });
        schemas.push(...(res.body.schemas || []));
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return schemas;
}
exports.listSchemas = listSchemas;
async function upsertSchema(schema, validateOnly = false, async = false) {
    const op = await dataconnectClient().patch(`${schema.name}`, schema, {
        queryParams: {
            allowMissing: "true",
            validateOnly: validateOnly ? "true" : "false",
        },
    });
    if (validateOnly || async) {
        return;
    }
    return operationPoller.pollOperation({
        apiOrigin: (0, api_1.dataconnectOrigin)(),
        apiVersion: DATACONNECT_API_VERSION,
        operationResourceName: op.body.name,
        masterTimeout: 120000,
    });
}
exports.upsertSchema = upsertSchema;
async function deleteSchema(serviceName) {
    const op = await dataconnectClient().delete(`${serviceName}/schemas/${types.SCHEMA_ID}`);
    await operationPoller.pollOperation({
        apiOrigin: (0, api_1.dataconnectOrigin)(),
        apiVersion: DATACONNECT_API_VERSION,
        operationResourceName: op.body.name,
    });
    return;
}
exports.deleteSchema = deleteSchema;
/** Connector methods */
async function getConnector(name) {
    const res = await dataconnectClient().get(name);
    return res.body;
}
exports.getConnector = getConnector;
async function deleteConnector(name) {
    const op = await dataconnectClient().delete(name);
    await operationPoller.pollOperation({
        apiOrigin: (0, api_1.dataconnectOrigin)(),
        apiVersion: DATACONNECT_API_VERSION,
        operationResourceName: op.body.name,
    });
    return;
}
exports.deleteConnector = deleteConnector;
async function listConnectors(serviceName, fields = []) {
    const connectors = [];
    const getNextPage = async (pageToken = "") => {
        const res = await dataconnectClient().get(`${serviceName}/connectors`, {
            queryParams: {
                pageSize: PAGE_SIZE_MAX,
                pageToken,
                fields: fields.join(","),
            },
        });
        connectors.push(...(res.body.connectors || []));
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return connectors;
}
exports.listConnectors = listConnectors;
async function upsertConnector(connector) {
    const op = await dataconnectClient().patch(`${connector.name}?allow_missing=true`, connector);
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.dataconnectOrigin)(),
        apiVersion: DATACONNECT_API_VERSION,
        operationResourceName: op.body.name,
    });
    return pollRes;
}
exports.upsertConnector = upsertConnector;
//# sourceMappingURL=client.js.map