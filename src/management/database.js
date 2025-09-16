"use strict";
/**
 * Functions for interacting with Realtime Database Management APIs.
 * Internal documentation: https://source.corp.google.com/piper///depot/google3/google/firebase/database/v1beta/rtdb_service.proto
 */
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
exports.listDatabaseInstances = exports.parseDatabaseLocation = exports.checkInstanceNameAvailable = exports.createInstance = exports.getDatabaseInstanceDetails = exports.populateInstanceDetails = exports.DatabaseLocation = exports.DatabaseInstanceState = exports.DatabaseInstanceType = exports.APP_LIST_PAGE_SIZE = exports.MGMT_API_VERSION = void 0;
const apiv2_1 = require("../apiv2");
const constants_1 = require("../emulator/constants");
const error_1 = require("../error");
const logger_1 = require("../logger");
const api_1 = require("../api");
const utils = __importStar(require("../utils"));
exports.MGMT_API_VERSION = "v1beta";
exports.APP_LIST_PAGE_SIZE = 100;
const TIMEOUT_MILLIS = 10000;
const INSTANCE_RESOURCE_NAME_REGEX = /projects\/([^/]+?)\/locations\/([^/]+?)\/instances\/([^/]*)/;
var DatabaseInstanceType;
(function (DatabaseInstanceType) {
    DatabaseInstanceType["DATABASE_INSTANCE_TYPE_UNSPECIFIED"] = "unspecified";
    DatabaseInstanceType["DEFAULT_DATABASE"] = "default_database";
    DatabaseInstanceType["USER_DATABASE"] = "user_database";
})(DatabaseInstanceType = exports.DatabaseInstanceType || (exports.DatabaseInstanceType = {}));
var DatabaseInstanceState;
(function (DatabaseInstanceState) {
    DatabaseInstanceState["LIFECYCLE_STATE_UNSPECIFIED"] = "unspecified";
    DatabaseInstanceState["ACTIVE"] = "active";
    DatabaseInstanceState["DISABLED"] = "disabled";
    DatabaseInstanceState["DELETED"] = "deleted";
})(DatabaseInstanceState = exports.DatabaseInstanceState || (exports.DatabaseInstanceState = {}));
var DatabaseLocation;
(function (DatabaseLocation) {
    DatabaseLocation["US_CENTRAL1"] = "us-central1";
    DatabaseLocation["EUROPE_WEST1"] = "europe-west1";
    DatabaseLocation["ASIA_SOUTHEAST1"] = "asia-southeast1";
    DatabaseLocation["ANY"] = "-";
})(DatabaseLocation = exports.DatabaseLocation || (exports.DatabaseLocation = {}));
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.rtdbManagementOrigin)(), apiVersion: exports.MGMT_API_VERSION });
/**
 * Populate instanceDetails in commandOptions.
 * @param options command options that will be modified to add instanceDetails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function populateInstanceDetails(options) {
    options.instanceDetails = await getDatabaseInstanceDetails(options.project, options.instance);
    return Promise.resolve();
}
exports.populateInstanceDetails = populateInstanceDetails;
/**
 * Get details for a Realtime Database instance from the management API.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 */
async function getDatabaseInstanceDetails(projectId, instanceName) {
    try {
        const response = await apiClient.request({
            method: "GET",
            path: `/projects/${projectId}/locations/-/instances/${instanceName}`,
            timeout: TIMEOUT_MILLIS,
        });
        return convertDatabaseInstance(response.body);
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        const emulatorHost = process.env[constants_1.Constants.FIREBASE_DATABASE_EMULATOR_HOST];
        if (emulatorHost) {
            // if the call failed due to some reason, and we're talking to the emulator,
            // return a reasonable default and swallow the error.
            return Promise.resolve({
                name: instanceName,
                project: projectId,
                location: DatabaseLocation.ANY,
                databaseUrl: utils.getDatabaseUrl(emulatorHost, instanceName, ""),
                type: DatabaseInstanceType.DEFAULT_DATABASE,
                state: DatabaseInstanceState.ACTIVE,
            });
        }
        throw new error_1.FirebaseError(`Failed to get instance details for instance: ${instanceName}. See firebase-debug.log for more details.`, {
            exit: 2,
            original: err,
        });
    }
}
exports.getDatabaseInstanceDetails = getDatabaseInstanceDetails;
/**
 * Create a new database instance.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 * @param location location for the project's instance.
 * @param databaseType type of the database being created.
 */
async function createInstance(projectId, instanceName, location, databaseType) {
    try {
        const response = await apiClient.request({
            method: "POST",
            path: `/projects/${projectId}/locations/${location}/instances`,
            queryParams: { databaseId: instanceName },
            body: { type: databaseType },
            timeout: TIMEOUT_MILLIS,
        });
        return convertDatabaseInstance(response.body);
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        return utils.reject(`Failed to create instance: ${instanceName}. See firebase-debug.log for more details.`, {
            code: 2,
            original: err,
        });
    }
}
exports.createInstance = createInstance;
/**
 * Checks if an instance with the specified name can be created.
 * @param projectId identifier for the user's project.
 * @param instanceName name of the RTDB instance.
 * @param databaseType type of the RTDB instance.
 * @param location location for the project's instance.
 * @return an object containing a boolean field "available", indicating if the specified name is available. If not available, the second optional array of strings "suggestedIds" is present and non-empty.
 */
async function checkInstanceNameAvailable(projectId, instanceName, databaseType, location) {
    if (!location) {
        location = DatabaseLocation.US_CENTRAL1;
    }
    try {
        await apiClient.request({
            method: "POST",
            path: `/projects/${projectId}/locations/${location}/instances`,
            queryParams: { databaseId: instanceName, validateOnly: "true" },
            body: { type: databaseType },
            timeout: TIMEOUT_MILLIS,
        });
        return { available: true };
    }
    catch (err) {
        logger_1.logger.debug(`Invalid Realtime Database instance name: ${instanceName}.${err.message ? " " + err.message : ""}`);
        const errBody = err.context.body.error;
        if (errBody?.details?.[0]?.metadata?.suggested_database_ids) {
            return {
                available: false,
                suggestedIds: errBody.details[0].metadata.suggested_database_ids.split(","),
            };
        }
        throw new error_1.FirebaseError(`Failed to validate Realtime Database instance name: ${instanceName}.`, {
            original: err,
        });
    }
}
exports.checkInstanceNameAvailable = checkInstanceNameAvailable;
/**
 * Parse the `DatabaseLocation` represented by the string
 * @param location the location to parse.
 * @param defaultLocation the default location value to use if unspecified.
 * @return specified default value if the string is undefined or empty, or parsed value.
 */
function parseDatabaseLocation(location, defaultLocation) {
    if (!location) {
        return defaultLocation;
    }
    switch (location.toLowerCase()) {
        case "us-central1":
            return DatabaseLocation.US_CENTRAL1;
        case "europe-west1":
            return DatabaseLocation.EUROPE_WEST1;
        case "asia-southeast1":
            return DatabaseLocation.ASIA_SOUTHEAST1;
        case "":
            return defaultLocation;
        default:
            throw new error_1.FirebaseError(`Unexpected location value: ${location}. Only us-central1, europe-west1, and asia-southeast1 locations are supported`);
    }
}
exports.parseDatabaseLocation = parseDatabaseLocation;
/**
 * Lists all database instances for the specified project.
 * Repeatedly calls the paginated API until all pages have been read.
 * @param projectId the project to list apps for.
 * @param location optional location filter to restrict instances to specified location.
 * @param pageSize the number of results to be returned in a response.
 * @return list of all DatabaseInstances.
 */
async function listDatabaseInstances(projectId, location, pageSize = exports.APP_LIST_PAGE_SIZE) {
    const instances = [];
    try {
        let nextPageToken = "";
        do {
            const queryParams = { pageSize };
            if (nextPageToken) {
                queryParams.pageToken = nextPageToken;
            }
            const response = await apiClient.request({
                method: "GET",
                path: `/projects/${projectId}/locations/${location}/instances`,
                queryParams,
                timeout: TIMEOUT_MILLIS,
            });
            if (response.body.instances) {
                instances.push(...response.body.instances.map(convertDatabaseInstance));
            }
            nextPageToken = response.body.nextPageToken;
        } while (nextPageToken);
        return instances;
    }
    catch (err) {
        logger_1.logger.debug(err.message);
        throw new error_1.FirebaseError(`Failed to list Firebase Realtime Database instances${location === DatabaseLocation.ANY ? "" : ` for location ${location}`}` + ". See firebase-debug.log for more info.", {
            exit: 2,
            original: err,
        });
    }
}
exports.listDatabaseInstances = listDatabaseInstances;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertDatabaseInstance(serverInstance) {
    if (!serverInstance.name) {
        throw new error_1.FirebaseError(`DatabaseInstance response is missing field "name"`);
    }
    const m = serverInstance.name.match(INSTANCE_RESOURCE_NAME_REGEX);
    if (!m || m.length !== 4) {
        throw new error_1.FirebaseError(`Error parsing instance resource name: ${serverInstance.name}, matches: ${m}`);
    }
    return {
        name: m[3],
        location: parseDatabaseLocation(m[2], DatabaseLocation.ANY),
        project: serverInstance.project,
        databaseUrl: serverInstance.databaseUrl,
        type: serverInstance.type,
        state: serverInstance.state,
    };
}
//# sourceMappingURL=database.js.map