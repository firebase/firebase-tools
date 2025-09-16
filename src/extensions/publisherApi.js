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
exports.getExtension = exports.listExtensionVersions = exports.listExtensions = exports.getExtensionVersion = exports.createExtensionVersionFromGitHubSource = exports.createExtensionVersionFromLocalSource = exports.undeprecateExtensionVersion = exports.deprecateExtensionVersion = exports.registerPublisherProfile = exports.getPublisherProfile = void 0;
const clc = __importStar(require("colorette"));
const operationPoller = __importStar(require("../operation-poller"));
const refs = __importStar(require("./refs"));
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const extensionsApi_1 = require("./extensionsApi");
const PUBLISHER_API_VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;
const extensionsPublisherApiClient = new apiv2_1.Client({
    urlPrefix: (0, api_1.extensionsPublisherOrigin)(),
    apiVersion: PUBLISHER_API_VERSION,
});
/**
 * @param projectId the project for which we are registering a PublisherProfile
 * @param publisherId the desired publisher ID
 */
async function getPublisherProfile(projectId, publisherId) {
    const res = await extensionsPublisherApiClient.get(`/projects/${projectId}/publisherProfile`, {
        queryParams: publisherId === undefined
            ? undefined
            : {
                publisherId,
            },
    });
    return res.body;
}
exports.getPublisherProfile = getPublisherProfile;
/**
 * @param projectId the project for which we are registering a PublisherProfile
 * @param publisherId the desired publisher ID
 */
async function registerPublisherProfile(projectId, publisherId) {
    const res = await extensionsPublisherApiClient.patch(`/projects/${projectId}/publisherProfile`, {
        publisherId,
        displayName: publisherId,
    }, {
        queryParams: {
            updateMask: "publisher_id,display_name",
        },
    });
    return res.body;
}
exports.registerPublisherProfile = registerPublisherProfile;
/**
 * @param extensionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@version)
 * @param deprecationMessage the deprecation message
 */
async function deprecateExtensionVersion(extensionRef, deprecationMessage) {
    const ref = refs.parse(extensionRef);
    try {
        const res = await extensionsPublisherApiClient.post(`/${refs.toExtensionVersionName(ref)}:deprecate`, {
            deprecationMessage,
        });
        return res.body;
    }
    catch (err) {
        if (err.status === 403) {
            throw new error_1.FirebaseError(`You are not the owner of extension '${clc.bold(extensionRef)}' and don’t have the correct permissions to deprecate this extension version.` + err, { status: err.status });
        }
        else if (err.status === 404) {
            throw new error_1.FirebaseError(`Extension version ${clc.bold(extensionRef)} was not found.`);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Error occurred deprecating extension version '${extensionRef}': ${err}`, {
            status: err.status,
        });
    }
}
exports.deprecateExtensionVersion = deprecateExtensionVersion;
/**
 * @param extensionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@version)
 */
async function undeprecateExtensionVersion(extensionRef) {
    const ref = refs.parse(extensionRef);
    try {
        const res = await extensionsPublisherApiClient.post(`/${refs.toExtensionVersionName(ref)}:undeprecate`);
        return res.body;
    }
    catch (err) {
        if (err.status === 403) {
            throw new error_1.FirebaseError(`You are not the owner of extension '${clc.bold(extensionRef)}' and don’t have the correct permissions to undeprecate this extension version.`, { status: err.status });
        }
        else if (err.status === 404) {
            throw new error_1.FirebaseError(`Extension version ${clc.bold(extensionRef)} was not found.`);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Error occurred undeprecating extension version '${extensionRef}': ${err}`, {
            status: err.status,
        });
    }
}
exports.undeprecateExtensionVersion = undeprecateExtensionVersion;
/**
 * @param extensionVersionRef user-friendly identifier for the extension version (publisher-id/extension-id@1.0.0)
 * @param packageUri public URI of the extension archive (zip or tarball)
 * @param extensionRoot root directory that contains this extension, defaults to "/".
 */
async function createExtensionVersionFromLocalSource(args) {
    const ref = refs.parse(args.extensionVersionRef);
    if (!ref.version) {
        throw new error_1.FirebaseError(`Extension version ref "${args.extensionVersionRef}" must supply a version.`);
    }
    // TODO(b/185176470): Publishing an extension with a previously deleted name will return 409.
    // Need to surface a better error, potentially by calling getExtension.
    const uploadRes = await extensionsPublisherApiClient.post(`/${refs.toExtensionName(ref)}/versions:createFromSource`, {
        versionId: ref.version,
        extensionRoot: args.extensionRoot ?? "/",
        remoteArchiveSource: {
            packageUri: args.packageUri,
        },
    });
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.extensionsPublisherOrigin)(),
        apiVersion: PUBLISHER_API_VERSION,
        operationResourceName: uploadRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
exports.createExtensionVersionFromLocalSource = createExtensionVersionFromLocalSource;
/**
 * @param extensionVersionRef user-friendly identifier for the extension version (publisher-id/extension-id@1.0.0)
 * @param repoUri public GitHub repo URI that contains the extension source
 * @param sourceRef commit hash, branch, or tag to build from the repo
 * @param extensionRoot root directory that contains this extension, defaults to "/".
 */
async function createExtensionVersionFromGitHubSource(args) {
    const ref = refs.parse(args.extensionVersionRef);
    if (!ref.version) {
        throw new error_1.FirebaseError(`Extension version ref "${args.extensionVersionRef}" must supply a version.`);
    }
    // TODO(b/185176470): Publishing an extension with a previously deleted name will return 409.
    // Need to surface a better error, potentially by calling getExtension.
    const uploadRes = await extensionsPublisherApiClient.post(`/${refs.toExtensionName(ref)}/versions:createFromSource`, {
        versionId: ref.version,
        extensionRoot: args.extensionRoot || "/",
        githubRepositorySource: {
            uri: args.repoUri,
            sourceRef: args.sourceRef,
        },
    });
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.extensionsPublisherOrigin)(),
        apiVersion: PUBLISHER_API_VERSION,
        operationResourceName: uploadRes.body.name,
        masterTimeout: 600000,
    });
    return pollRes;
}
exports.createExtensionVersionFromGitHubSource = createExtensionVersionFromGitHubSource;
/**
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 */
async function getExtensionVersion(extensionVersionRef) {
    const ref = refs.parse(extensionVersionRef);
    if (!ref.version) {
        throw new error_1.FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
    }
    try {
        const res = await extensionsPublisherApiClient.get(`/${refs.toExtensionVersionName(ref)}`);
        if (res.body.spec) {
            (0, extensionsApi_1.populateSpec)(res.body.spec);
        }
        return res.body;
    }
    catch (err) {
        if (err.status === 404) {
            throw (0, extensionsApi_1.refNotFoundError)(ref);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Failed to query the extension version '${clc.bold(extensionVersionRef)}': ${err}`);
    }
}
exports.getExtensionVersion = getExtensionVersion;
/**
 * @param publisherId the publisher for which we are listing Extensions
 */
async function listExtensions(publisherId) {
    const extensions = [];
    const getNextPage = async (pageToken = "") => {
        const res = await extensionsPublisherApiClient.get(`/publishers/${publisherId}/extensions`, {
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
        const res = await extensionsPublisherApiClient.get(`/publishers/${publisherId}/extensions/${extensionId}/versions`, {
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
 * @param ref user-friendly identifier for the Extension (publisher-id/extension-id)
 * @return the extension
 */
async function getExtension(extensionRef) {
    const ref = refs.parse(extensionRef);
    try {
        const res = await extensionsPublisherApiClient.get(`/${refs.toExtensionName(ref)}`);
        return res.body;
    }
    catch (err) {
        if (err.status === 404) {
            throw (0, extensionsApi_1.refNotFoundError)(ref);
        }
        else if (err instanceof error_1.FirebaseError) {
            throw err;
        }
        throw new error_1.FirebaseError(`Failed to query the extension '${clc.bold(extensionRef)}': ${err}`, {
            status: err.status,
        });
    }
}
exports.getExtension = getExtension;
//# sourceMappingURL=publisherApi.js.map