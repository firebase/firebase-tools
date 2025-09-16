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
exports.getDownloadUrl = exports.getServiceAccount = exports.listBuckets = exports.createBucket = exports.getBucket = exports.deleteObject = exports.getObject = exports.uploadObject = exports.upload = exports.getDefaultBucket = void 0;
const path = __importStar(require("path"));
const clc = __importStar(require("colorette"));
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const logger_1 = require("../logger");
const ensureApiEnabled_1 = require("../ensureApiEnabled");
async function getDefaultBucket(projectId) {
    await (0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.firebaseStorageOrigin)(), "storage", false);
    try {
        const localAPIClient = new apiv2_1.Client({
            urlPrefix: (0, api_1.firebaseStorageOrigin)(),
            apiVersion: "v1alpha",
        });
        const response = await localAPIClient.get(`/projects/${projectId}/defaultBucket`);
        if (!response.body?.bucket.name) {
            logger_1.logger.debug("Default storage bucket is undefined.");
            throw new error_1.FirebaseError("Your project is being set up. Please wait a minute before deploying again.");
        }
        return response.body.bucket.name.split("/").pop();
    }
    catch (err) {
        if (err?.status === 404) {
            throw new error_1.FirebaseError(`Firebase Storage has not been set up on project '${clc.bold(projectId)}'. Go to https://console.firebase.google.com/project/${projectId}/storage and click 'Get Started' to set up Firebase Storage.`);
        }
        logger_1.logger.info("\n\nUnexpected error when fetching default storage bucket.");
        throw err;
    }
}
exports.getDefaultBucket = getDefaultBucket;
async function upload(source, uploadUrl, extraHeaders, ignoreQuotaProject) {
    const url = new URL(uploadUrl);
    const localAPIClient = new apiv2_1.Client({ urlPrefix: url.origin, auth: false });
    const res = await localAPIClient.request({
        method: "PUT",
        path: url.pathname,
        queryParams: url.searchParams,
        responseType: "xml",
        headers: {
            "content-type": "application/zip",
            ...extraHeaders,
        },
        body: source.stream,
        skipLog: { resBody: true },
        ignoreQuotaProject,
    });
    return {
        generation: res.response.headers.get("x-goog-generation"),
    };
}
exports.upload = upload;
/**
 * Uploads a zip file to the specified bucket using the firebasestorage api.
 */
async function uploadObject(
/** Source with file (name) to upload, and stream of file. */
source, 
/** Bucket to upload to. */
bucketName) {
    if (path.extname(source.file) !== ".zip") {
        throw new error_1.FirebaseError(`Expected a file name ending in .zip, got ${source.file}`);
    }
    const localAPIClient = new apiv2_1.Client({ urlPrefix: (0, api_1.storageOrigin)() });
    const location = `/${bucketName}/${path.basename(source.file)}`;
    const res = await localAPIClient.request({
        method: "PUT",
        path: location,
        headers: {
            "Content-Type": "application/zip",
            "x-goog-content-length-range": "0,123289600",
        },
        body: source.stream,
    });
    return {
        bucket: bucketName,
        object: path.basename(source.file),
        generation: res.response.headers.get("x-goog-generation"),
    };
}
exports.uploadObject = uploadObject;
/**
 * Get a storage object from GCP.
 * @param {string} bucketName name of the storage bucket that contains the object
 * @param {string} objectName name of the object
 */
async function getObject(bucketName, objectName) {
    const client = new apiv2_1.Client({ urlPrefix: (0, api_1.storageOrigin)() });
    const res = await client.get(`/storage/v1/b/${bucketName}/o/${objectName}`);
    return res.body;
}
exports.getObject = getObject;
/**
 * Deletes an object via Firebase Storage.
 * @param {string} location A Firebase Storage location, of the form "/v0/b/<bucket>/o/<object>"
 */
function deleteObject(location) {
    const localAPIClient = new apiv2_1.Client({ urlPrefix: (0, api_1.storageOrigin)() });
    return localAPIClient.delete(location);
}
exports.deleteObject = deleteObject;
/**
 * Gets a storage bucket from GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/get
 * @param {string} bucketName name of the storage bucket
 * @return a bucket resource object
 */
async function getBucket(bucketName) {
    try {
        const localAPIClient = new apiv2_1.Client({ urlPrefix: (0, api_1.storageOrigin)() });
        const result = await localAPIClient.get(`/storage/v1/b/${bucketName}`);
        return result.body;
    }
    catch (err) {
        logger_1.logger.debug(err);
        throw new error_1.FirebaseError("Failed to obtain the storage bucket", {
            original: err,
        });
    }
}
exports.getBucket = getBucket;
/**
 * Creates a storage bucket on GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/insert
 * @param {string} bucketName name of the storage bucket
 * @return a bucket resource object
 */
async function createBucket(projectId, req) {
    try {
        const localAPIClient = new apiv2_1.Client({ urlPrefix: (0, api_1.storageOrigin)() });
        const result = await localAPIClient.post(`/storage/v1/b`, req, {
            queryParams: {
                project: projectId,
            },
        });
        return result.body;
    }
    catch (err) {
        logger_1.logger.debug(err);
        throw new error_1.FirebaseError("Failed to create the storage bucket", {
            original: err,
        });
    }
}
exports.createBucket = createBucket;
/**
 * Gets the list of storage buckets associated with a specific project from GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/list
 * @param {string} bucketName name of the storage bucket
 * @return a bucket resource object
 */
async function listBuckets(projectId) {
    try {
        const localAPIClient = new apiv2_1.Client({ urlPrefix: (0, api_1.storageOrigin)() });
        const result = await localAPIClient.get(`/storage/v1/b?project=${projectId}`);
        return result.body.items.map((bucket) => bucket.name);
    }
    catch (err) {
        logger_1.logger.debug(err);
        throw new error_1.FirebaseError("Failed to read the storage buckets", {
            original: err,
        });
    }
}
exports.listBuckets = listBuckets;
/**
 * Find the service account for the Cloud Storage Resource
 * @param {string} projectId the project identifier
 * @returns:
 * {
 *  "email_address": string,
 *  "kind": "storage#serviceAccount",
 * }
 */
async function getServiceAccount(projectId) {
    try {
        const localAPIClient = new apiv2_1.Client({ urlPrefix: (0, api_1.storageOrigin)() });
        const response = await localAPIClient.get(`/storage/v1/projects/${projectId}/serviceAccount`);
        return response.body;
    }
    catch (err) {
        logger_1.logger.debug(err);
        throw new error_1.FirebaseError("Failed to obtain the Cloud Storage service agent", {
            original: err,
        });
    }
}
exports.getServiceAccount = getServiceAccount;
/**
 * getDownloadUrl finds a publicly accessible download url for an object in Firebase storage.
 * @param bucketName the bucket which contains the object you are looking for.
 * @param objectPath a path within the bucket where the obejct resides.
 * @return the string HTTP path to download the object.
 */
async function getDownloadUrl(bucketName, objectPath, emulatorUrl) {
    try {
        const origin = emulatorUrl || (0, api_1.firebaseStorageOrigin)();
        const localAPIClient = new apiv2_1.Client({ urlPrefix: origin });
        const response = await localAPIClient.get(`/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}`);
        if (emulatorUrl) {
            return `${origin}/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media`;
        }
        if (!response.body.downloadTokens) {
            throw new Error(`no download tokens exist for ${objectPath}, please visit the Firebase console to make one`);
        }
        const [token] = response.body.downloadTokens.split(",");
        return `${origin}/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    }
    catch (err) {
        logger_1.logger.error(err);
        throw new error_1.FirebaseError(`${err} Check that you have permission in the Firebase console to generate a download token`, {
            original: err,
        });
    }
}
exports.getDownloadUrl = getDownloadUrl;
//# sourceMappingURL=storage.js.map