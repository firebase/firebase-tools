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
exports.refNotFoundError = exports.getExtension = exports.listExtensionVersions = exports.listExtensions = exports.getExtensionVersion = exports.getSource = exports.createSource = exports.populateSpec = exports.updateInstanceFromRegistry = exports.updateInstance = exports.configureInstance = exports.listInstances = exports.getInstance = exports.deleteInstance = exports.createInstance = void 0;
const yaml = __importStar(require("yaml"));
const clc = __importStar(require("colorette"));
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const error_1 = require("../error");
const logger_1 = require("../logger");
const operationPoller = __importStar(require("../operation-poller"));
const refs = __importStar(require("./refs"));
const types_1 = require("./types");
const EXTENSIONS_API_VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;
const extensionsApiClient = new apiv2_1.Client({
    urlPrefix: (0, api_1.extensionsOrigin)(),
    apiVersion: EXTENSIONS_API_VERSION,
});
/**
 * Create a new extension instance, given a extension source path or extension reference, a set of params, and a service account.
 * @param projectId the project to create the instance in
 * @param instanceId the id to set for the instance
 * @param config instance configuration
 * @param labels labels for the instance
 * @param validateOnly if true we only perform validation, not the actual creation
 */
async function createInstanceHelper(projectId, instanceId, config, labels, validateOnly = false) {
    const createRes = await extensionsApiClient.post(`/projects/${projectId}/instances/`, {
        name: `projects/${projectId}/instances/${instanceId}`,
        config,
        labels,
    }, {
        queryParams: {
            validateOnly: validateOnly ? "true" : "false",
        },
    });
    if (validateOnly) {
        return createRes.body;
    }
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.extensionsOrigin)(),
        apiVersion: EXTENSIONS_API_VERSION,
        operationResourceName: createRes.body.name,
        masterTimeout: 3600000,
    });
    return pollRes;
}
/**
 * Create a new extension instance, given a extension source path, a set of params, and a service account.
 * @param args the args for creating the instance
 */
async function createInstance(args) {
    const config = {
        params: args.params,
        systemParams: args.systemParams ?? {},
        allowedEventTypes: args.allowedEventTypes,
        eventarcChannel: args.eventarcChannel,
    };
    if (args.extensionSource && args.extensionVersionRef) {
        throw new error_1.FirebaseError("ExtensionSource and ExtensionVersion both provided, but only one should be.");
    }
    else if (args.extensionSource) {
        config.source = { name: args.extensionSource?.name };
    }
    else if (args.extensionVersionRef) {
        const ref = refs.parse(args.extensionVersionRef);
        config.extensionRef = refs.toExtensionRef(ref);
        config.extensionVersion = ref.version ?? "";
    }
    else {
        throw new error_1.FirebaseError("No ExtensionVersion or ExtensionSource provided but one is required.");
    }
    if (args.allowedEventTypes) {
        config.allowedEventTypes = args.allowedEventTypes;
    }
    if (args.eventarcChannel) {
        config.eventarcChannel = args.eventarcChannel;
    }
    return await createInstanceHelper(args.projectId, args.instanceId, config, args.labels, args.validateOnly);
}
exports.createInstance = createInstance;
/**
 * Delete an instance and all of the associated resources and its service account.
 * @param projectId the project where the instance exists
 * @param instanceId the id of the instance to delete
 */
async function deleteInstance(projectId, instanceId) {
    const deleteRes = await extensionsApiClient.delete(`/projects/${projectId}/instances/${instanceId}`);
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.extensionsOrigin)(),
        apiVersion: EXTENSIONS_API_VERSION,
        operationResourceName: deleteRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
exports.deleteInstance = deleteInstance;
/**
 * Get an instance by its id.
 * @param projectId the project where the instance exists
 * @param instanceId the id of the instance to delete
 */
async function getInstance(projectId, instanceId) {
    try {
        const res = await extensionsApiClient.get(`/projects/${projectId}/instances/${instanceId}`);
        if ((0, types_1.isExtensionInstance)(res.body)) {
            return res.body;
        }
    }
    catch (err) {
        if ((0, error_1.getErrStatus)(err) === 404) {
            throw new error_1.FirebaseError(`Extension instance '${clc.bold(instanceId)}' not found in project '${clc.bold(projectId)}'.`, { status: 404 });
        }
        throw err;
    }
}
exports.getInstance = getInstance;
/**
 * Returns a list of all installed extension instances on the project with projectId.
 * @param projectId the project to list instances for
 */
async function listInstances(projectId) {
    const instances = [];
    const getNextPage = async (pageToken = "") => {
        const res = await extensionsApiClient.get(`/projects/${projectId}/instances`, {
            queryParams: {
                pageSize: PAGE_SIZE_MAX,
                pageToken,
            },
        });
        if (Array.isArray(res.body.instances)) {
            instances.push(...res.body.instances);
        }
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return instances;
}
exports.listInstances = listInstances;
/**
 * Configure a extension instance, given an project id, instance id, and a set of params
 * @param args the args to configure the instance
 * @param args.projectId the project the instance is in
 * @param args.instanceId the id of the instance to configure
 * @param args.params params to configure the extension instance
 * @param args.systemParams system params to configure the extension instance
 * @param args.canEmitEvents if the instance can emit events
 * @param args.allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param args.eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param args.validateOnly if true, only validates the update and makes no changes
 */
async function configureInstance(args) {
    const reqBody = {
        projectId: args.projectId,
        instanceId: args.instanceId,
        updateMask: "config.params",
        validateOnly: args.validateOnly ?? false,
        data: {
            config: {
                params: args.params,
            },
        },
    };
    if (args.canEmitEvents) {
        if (args.allowedEventTypes === undefined || args.eventarcChannel === undefined) {
            throw new error_1.FirebaseError(`This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`);
        }
        reqBody.data.config.allowedEventTypes = args.allowedEventTypes;
        reqBody.data.config.eventarcChannel = args.eventarcChannel;
    }
    reqBody.updateMask += ",config.allowed_event_types,config.eventarc_channel";
    if (args.systemParams) {
        reqBody.data.config.systemParams = args.systemParams;
        reqBody.updateMask += ",config.system_params";
    }
    return patchInstance(reqBody);
}
exports.configureInstance = configureInstance;
/**
 * Update the version of a extension instance, given an project id, instance id, and a set of params
 * @param args The update instance args
 * @param args.projectId the project the instance is in
 * @param args.instanceId the id of the instance to configure
 * @param args.extensionSource the source for the version of the extension to update to
 * @param args.params params to update the extension instance
 * @param args.systemParams system params to update the extension instance
 * @param args.canEmitEvents if the instance can emit events
 * @param args.allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param args.eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param args.validateOnly if true, only validates the update and makes no changes
 */
async function updateInstance(args) {
    const body = {
        config: {
            source: { name: args.extensionSource.name },
        },
    };
    let updateMask = "config.source.name";
    if (args.params) {
        body.config.params = args.params;
        updateMask += ",config.params";
    }
    if (args.systemParams) {
        body.config.systemParams = args.systemParams;
        updateMask += ",config.system_params";
    }
    if (args.canEmitEvents) {
        if (args.allowedEventTypes === undefined || args.eventarcChannel === undefined) {
            throw new error_1.FirebaseError(`This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`);
        }
        body.config.allowedEventTypes = args.allowedEventTypes;
        body.config.eventarcChannel = args.eventarcChannel;
    }
    updateMask += ",config.allowed_event_types,config.eventarc_channel";
    return patchInstance({
        projectId: args.projectId,
        instanceId: args.instanceId,
        updateMask,
        validateOnly: args.validateOnly ?? false,
        data: body,
    });
}
exports.updateInstance = updateInstance;
/**
 * Update the version of a extension instance, given an project id, instance id, and a set of params
 * @param args the update args
 * @param args.projectId the project the instance is in
 * @param args.instanceId the id of the instance to configure
 * @param args.extRef reference for the extension to update to
 * @param args.params params to configure the extension instance
 * @param args.systemParams system params to configure the extension instance
 * @param args.canEmitEvents if the instance can emit events
 * @param args.allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param args.eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param args.validateOnly if true, only validates the update and makes no changes
 */
async function updateInstanceFromRegistry(args) {
    const ref = refs.parse(args.extRef);
    const body = {
        config: {
            extensionRef: refs.toExtensionRef(ref),
            extensionVersion: ref.version,
        },
    };
    let updateMask = "config.extension_ref,config.extension_version";
    if (args.params) {
        body.config.params = args.params;
        updateMask += ",config.params";
    }
    if (args.systemParams) {
        body.config.systemParams = args.systemParams;
        updateMask += ",config.system_params";
    }
    if (args.canEmitEvents) {
        if (args.allowedEventTypes === undefined || args.eventarcChannel === undefined) {
            throw new error_1.FirebaseError(`This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`);
        }
        body.config.allowedEventTypes = args.allowedEventTypes;
        body.config.eventarcChannel = args.eventarcChannel;
    }
    updateMask += ",config.allowed_event_types,config.eventarc_channel";
    return patchInstance({
        projectId: args.projectId,
        instanceId: args.instanceId,
        updateMask,
        validateOnly: args.validateOnly ?? false,
        data: body,
    });
}
exports.updateInstanceFromRegistry = updateInstanceFromRegistry;
async function patchInstance(args) {
    const updateRes = await extensionsApiClient.patch(`/projects/${args.projectId}/instances/${args.instanceId}`, args.data, {
        queryParams: {
            updateMask: args.updateMask,
            validateOnly: args.validateOnly ? "true" : "false",
        },
    });
    if (args.validateOnly) {
        return updateRes;
    }
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.extensionsOrigin)(),
        apiVersion: EXTENSIONS_API_VERSION,
        operationResourceName: updateRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
/**
 * populates the spec by parsing yaml properties into real properties
 * @param spec The spec to populate
 */
function populateSpec(spec) {
    if (spec) {
        for (const r of spec.resources) {
            try {
                if (r.propertiesYaml) {
                    r.properties = yaml.parse(r.propertiesYaml);
                }
            }
            catch (err) {
                logger_1.logger.debug(`[ext] failed to parse resource properties yaml: ${(0, error_1.getErrMsg)(err)}`);
            }
        }
        // We need to populate empty repeated fields with empty arrays, since proto wire format removes them.
        spec.params = spec.params ?? [];
        spec.systemParams = spec.systemParams ?? [];
    }
}
exports.populateSpec = populateSpec;
/**
 * Create a new extension source
 * @param projectId The project to create the source in
 * @param packageUri A URI for a zipper archive of a extension source
 * @param extensionRoot A directory inside the archive to look for extension.yaml
 */
async function createSource(projectId, packageUri, extensionRoot) {
    const createRes = await extensionsApiClient.post(`/projects/${projectId}/sources/`, {
        packageUri,
        extensionRoot,
    });
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.extensionsOrigin)(),
        apiVersion: EXTENSIONS_API_VERSION,
        operationResourceName: createRes.body.name,
        masterTimeout: 600000,
    });
    if (pollRes.spec) {
        populateSpec(pollRes.spec);
    }
    return pollRes;
}
exports.createSource = createSource;
/**
 * Get a extension source by its fully qualified path
 * @param sourceName the fully qualified path of the extension source (/projects/<projectId>/sources/<sourceId>)
 */
async function getSource(sourceName) {
    const res = await extensionsApiClient.get(`/${sourceName}`);
    if (res.body.spec) {
        populateSpec(res.body.spec);
    }
    return res.body;
}
exports.getSource = getSource;
/**
 * @param extensionVersionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 */
async function getExtensionVersion(extensionVersionRef) {
    const ref = refs.parse(extensionVersionRef);
    if (!ref.version) {
        throw new error_1.FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
    }
    try {
        const res = await extensionsApiClient.get(`/${refs.toExtensionVersionName(ref)}`);
        if (res.body.spec) {
            populateSpec(res.body.spec);
        }
        return res.body;
    }
    catch (err) {
        if ((0, error_1.getErrStatus)(err) === 404) {
            throw refNotFoundError(ref);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Failed to query the extension version '${clc.bold(extensionVersionRef)}': ${(0, error_1.getErrMsg)(err)}`);
    }
}
exports.getExtensionVersion = getExtensionVersion;
/**
 * @param publisherId the publisher for which we are listing Extensions
 */
async function listExtensions(publisherId) {
    const extensions = [];
    const getNextPage = async (pageToken = "") => {
        const res = await extensionsApiClient.get(`/publishers/${publisherId}/extensions`, {
            queryParams: {
                pageSize: PAGE_SIZE_MAX,
                pageToken,
            },
        });
        if (Array.isArray(res.body.extensions)) {
            extensions.push(...res.body.extensions);
        }
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return extensions;
}
exports.listExtensions = listExtensions;
/**
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id)
 */
async function listExtensionVersions(ref, filter = "", showPrereleases = false) {
    const { publisherId, extensionId } = refs.parse(ref);
    const extensionVersions = [];
    const getNextPage = async (pageToken = "") => {
        const res = await extensionsApiClient.get(`/publishers/${publisherId}/extensions/${extensionId}/versions`, {
            queryParams: {
                filter,
                showPrereleases: String(showPrereleases),
                pageSize: PAGE_SIZE_MAX,
                pageToken,
            },
        });
        if (Array.isArray(res.body.extensionVersions)) {
            extensionVersions.push(...res.body.extensionVersions);
        }
        if (res.body.nextPageToken) {
            await getNextPage(res.body.nextPageToken);
        }
    };
    await getNextPage();
    return extensionVersions;
}
exports.listExtensionVersions = listExtensionVersions;
/**
 * @param extensionRef user-friendly identifier for the Extension (publisher-id/extension-id)
 * @return the extension
 */
async function getExtension(extensionRef) {
    const ref = refs.parse(extensionRef);
    try {
        const res = await extensionsApiClient.get(`/${refs.toExtensionName(ref)}`);
        return res.body;
    }
    catch (err) {
        if ((0, error_1.getErrStatus)(err) === 404) {
            throw refNotFoundError(ref);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Failed to query the extension '${clc.bold(extensionRef)}': ${(0, error_1.getErrMsg)(err)}`, {
            status: (0, error_1.getErrStatus)(err),
        });
    }
}
exports.getExtension = getExtension;
/**
 * refNotFoundError returns a nicely formatted error when a reference is not found
 * @param ref The reference that is missing
 * @return a formatted FirebaseError
 */
function refNotFoundError(ref) {
    return new error_1.FirebaseError(`The extension reference '${clc.bold(ref.version ? refs.toExtensionVersionRef(ref) : refs.toExtensionRef(ref))}' doesn't exist. This could happen for two reasons:\n` +
        `  -The publisher ID '${clc.bold(ref.publisherId)}' doesn't exist or could be misspelled\n` +
        `  -The name of the ${ref.version ? "extension version" : "extension"} '${clc.bold(ref.version ? `${ref.extensionId}@${ref.version}` : ref.extensionId)}' doesn't exist or could be misspelled\n\n` +
        `Please correct the extension reference and try again. If you meant to reference an extension from a local source, please provide a relative path prefixed with '${clc.bold("./")}', '${clc.bold("../")}', or '${clc.bold("~/")}'.}`, { status: 404 });
}
exports.refNotFoundError = refNotFoundError;
//# sourceMappingURL=extensionsApi.js.map