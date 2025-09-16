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
exports.readConnectorYaml = exports.readDataConnectYaml = exports.readFirebaseJson = exports.load = exports.loadAll = exports.pickService = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
const clc = __importStar(require("colorette"));
const glob_1 = require("glob");
const error_1 = require("../error");
const types_1 = require("./types");
const utils_1 = require("../utils");
// pickService reads firebase.json and returns all services with a given serviceId.
// If serviceID is not provided and there is a single service, return that.
async function pickService(projectId, config, serviceId) {
    const serviceInfos = await loadAll(projectId, config);
    if (serviceInfos.length === 0) {
        throw new error_1.FirebaseError("No Data Connect services found in firebase.json." +
            `\nYou can run ${clc.bold("firebase init dataconnect")} to add a Data Connect service.`);
    }
    else if (serviceInfos.length === 1) {
        if (serviceId && serviceId !== serviceInfos[0].dataConnectYaml.serviceId) {
            throw new error_1.FirebaseError(`No service named ${serviceId} declared in firebase.json. Found ${serviceInfos[0].dataConnectYaml.serviceId}.` +
                `\nYou can run ${clc.bold("firebase init dataconnect")} to add this Data Connect service.`);
        }
        return serviceInfos[0];
    }
    else {
        if (!serviceId) {
            throw new error_1.FirebaseError("Multiple Data Connect services found in firebase.json. Please specify a service ID to use.");
        }
        // TODO: handle cases where there are services with the same ID in 2 locations.
        const maybe = serviceInfos.find((i) => i.dataConnectYaml.serviceId === serviceId);
        if (!maybe) {
            const serviceIds = serviceInfos.map((i) => i.dataConnectYaml.serviceId);
            throw new error_1.FirebaseError(`No service named ${serviceId} declared in firebase.json. Found ${serviceIds.join(", ")}.` +
                `\nYou can run ${clc.bold("firebase init dataconnect")} to add this Data Connect service.`);
        }
        return maybe;
    }
}
exports.pickService = pickService;
/**
 * Loads all Data Connect service configurations from the firebase.json file.
 */
async function loadAll(projectId, config) {
    const serviceCfgs = readFirebaseJson(config);
    return await Promise.all(serviceCfgs.map((c) => load(projectId, config, c.source)));
}
exports.loadAll = loadAll;
/**
 * loads schemas and connectors from  {sourceDirectory}/dataconnect.yaml
 */
async function load(projectId, config, sourceDirectory) {
    // TODO: better error handling when config read fails
    const resolvedDir = config.path(sourceDirectory);
    const dataConnectYaml = await readDataConnectYaml(resolvedDir);
    const serviceName = `projects/${projectId}/locations/${dataConnectYaml.location}/services/${dataConnectYaml.serviceId}`;
    const schemaDir = path.join(resolvedDir, dataConnectYaml.schema.source);
    const schemaGQLs = await readGQLFiles(schemaDir);
    const connectorInfo = await Promise.all(dataConnectYaml.connectorDirs.map(async (dir) => {
        const connectorDir = path.join(resolvedDir, dir);
        const connectorYaml = await readConnectorYaml(connectorDir);
        const connectorGqls = await readGQLFiles(connectorDir);
        return {
            directory: connectorDir,
            connectorYaml,
            connector: {
                name: `${serviceName}/connectors/${connectorYaml.connectorId}`,
                source: {
                    files: connectorGqls,
                },
            },
        };
    }));
    return {
        serviceName,
        sourceDirectory: resolvedDir,
        schema: {
            name: `${serviceName}/schemas/${types_1.SCHEMA_ID}`,
            datasources: [
                (0, types_1.toDatasource)(projectId, dataConnectYaml.location, dataConnectYaml.schema.datasource),
            ],
            source: {
                files: schemaGQLs,
            },
        },
        dataConnectYaml,
        connectorInfo,
    };
}
exports.load = load;
function readFirebaseJson(config) {
    if (!config?.has("dataconnect")) {
        return [];
    }
    const validator = (cfg) => {
        if (!cfg["source"]) {
            throw new error_1.FirebaseError("Invalid firebase.json: DataConnect requires `source`");
        }
        return {
            source: cfg["source"],
        };
    };
    const configs = config.get("dataconnect");
    if (typeof configs === "object" && !Array.isArray(configs)) {
        return [validator(configs)];
    }
    else if (Array.isArray(configs)) {
        return configs.map(validator);
    }
    else {
        throw new error_1.FirebaseError("Invalid firebase.json: dataconnect should be of the form { source: string }");
    }
}
exports.readFirebaseJson = readFirebaseJson;
async function readDataConnectYaml(sourceDirectory) {
    const file = await (0, utils_1.readFileFromDirectory)(sourceDirectory, "dataconnect.yaml");
    const dataconnectYaml = await (0, utils_1.wrappedSafeLoad)(file.source);
    return validateDataConnectYaml(dataconnectYaml);
}
exports.readDataConnectYaml = readDataConnectYaml;
function validateDataConnectYaml(unvalidated) {
    // TODO: Use json schema for validation here!
    if (!unvalidated["location"]) {
        throw new error_1.FirebaseError("Missing required field 'location' in dataconnect.yaml");
    }
    return unvalidated;
}
async function readConnectorYaml(sourceDirectory) {
    const file = await (0, utils_1.readFileFromDirectory)(sourceDirectory, "connector.yaml");
    const connectorYaml = await (0, utils_1.wrappedSafeLoad)(file.source);
    return validateConnectorYaml(connectorYaml);
}
exports.readConnectorYaml = readConnectorYaml;
function validateConnectorYaml(unvalidated) {
    // TODO: Add validation
    return unvalidated;
}
async function readGQLFiles(sourceDir) {
    if (!fs.existsSync(sourceDir)) {
        return [];
    }
    const files = await (0, glob_1.glob)("**/*.{gql,graphql}", { cwd: sourceDir, absolute: true, nodir: true });
    return files.map((f) => toFile(sourceDir, f));
}
function toFile(sourceDir, fullPath) {
    const relPath = path.relative(sourceDir, fullPath);
    if (!fs.existsSync(fullPath)) {
        throw new error_1.FirebaseError(`file ${fullPath} not found`);
    }
    const content = fs.readFileSync(fullPath).toString();
    return {
        path: relPath,
        content,
    };
}
//# sourceMappingURL=load.js.map