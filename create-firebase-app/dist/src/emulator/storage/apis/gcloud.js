"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCloudEndpoints = void 0;
const express_1 = require("express");
const types_1 = require("../../types");
const metadata_1 = require("../metadata");
const shared_1 = require("./shared");
const registry_1 = require("../../registry");
const emulatorLogger_1 = require("../../emulatorLogger");
const multipart_1 = require("../multipart");
const upload_1 = require("../upload");
const errors_1 = require("../errors");
const request_1 = require("../../shared/request");
function createCloudEndpoints(emulator) {
    // eslint-disable-next-line new-cap
    const gcloudStorageAPI = (0, express_1.Router)();
    // Use Admin StorageLayer to ensure Firebase Rules validation is skipped.
    const { adminStorageLayer, uploadService } = emulator;
    // Debug statements
    if (process.env.STORAGE_EMULATOR_DEBUG) {
        gcloudStorageAPI.use((req, res, next) => {
            console.log("--------------INCOMING GCS REQUEST--------------");
            console.log(`${req.method.toUpperCase()} ${req.path}`);
            console.log("-- query:");
            console.log(JSON.stringify(req.query, undefined, 2));
            console.log("-- headers:");
            console.log(JSON.stringify(req.headers, undefined, 2));
            console.log("-- body:");
            if (req.body instanceof Buffer) {
                console.log(`Buffer of ${req.body.length}`);
            }
            else if (req.body) {
                console.log(req.body);
            }
            else {
                console.log("Empty body (could be stream)");
            }
            const resJson = res.json.bind(res);
            res.json = (...args) => {
                console.log("-- response:");
                args.forEach((data) => console.log(JSON.stringify(data, undefined, 2)));
                return resJson.call(res, ...args);
            };
            const resSendStatus = res.sendStatus.bind(res);
            res.sendStatus = (status) => {
                console.log("-- response status:");
                console.log(status);
                return resSendStatus.call(res, status);
            };
            const resStatus = res.status.bind(res);
            res.status = (status) => {
                console.log("-- response status:");
                console.log(status);
                return resStatus.call(res, status);
            };
            next();
        });
    }
    // Automatically create a bucket for any route which uses a bucket
    gcloudStorageAPI.use(/.*\/b\/(.+?)\/.*/, (req, res, next) => {
        adminStorageLayer.createBucket(req.params[0]);
        next();
    });
    gcloudStorageAPI.get("/b", async (req, res) => {
        res.json({
            kind: "storage#buckets",
            items: await adminStorageLayer.listBuckets(),
        });
    });
    gcloudStorageAPI.get([
        "/b/:bucketId/o/:objectId",
        "/download/storage/v1/b/:bucketId/o/:objectId",
        "/storage/v1/b/:bucketId/o/:objectId",
    ], async (req, res) => {
        let getObjectResponse;
        try {
            getObjectResponse = await adminStorageLayer.getObject({
                bucketId: req.params.bucketId,
                decodedObjectId: req.params.objectId,
            });
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError) {
                return sendObjectNotFound(req, res);
            }
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        if (req.query.alt === "media") {
            return (0, shared_1.sendFileBytes)(getObjectResponse.metadata, getObjectResponse.data, req, res);
        }
        return res.json(new metadata_1.CloudStorageObjectMetadata(getObjectResponse.metadata));
    });
    gcloudStorageAPI.patch("/b/:bucketId/o/:objectId", async (req, res) => {
        let updatedMetadata;
        try {
            updatedMetadata = await adminStorageLayer.updateObjectMetadata({
                bucketId: req.params.bucketId,
                decodedObjectId: req.params.objectId,
                metadata: req.body,
            });
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError) {
                return sendObjectNotFound(req, res);
            }
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        return res.json(new metadata_1.CloudStorageObjectMetadata(updatedMetadata));
    });
    gcloudStorageAPI.get(["/b/:bucketId/o", "/storage/v1/b/:bucketId/o"], async (req, res) => {
        var _a;
        let listResponse;
        // TODO validate that all query params are single strings and are not repeated.
        try {
            listResponse = await adminStorageLayer.listObjects({
                bucketId: req.params.bucketId,
                prefix: req.query.prefix ? req.query.prefix.toString() : "",
                delimiter: req.query.delimiter ? req.query.delimiter.toString() : "",
                pageToken: req.query.pageToken ? req.query.pageToken.toString() : undefined,
                maxResults: req.query.maxResults ? +req.query.maxResults.toString() : undefined,
                authorization: req.header("authorization"),
            });
        }
        catch (err) {
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        return res.status(200).json({
            kind: "storage#objects",
            nextPageToken: listResponse.nextPageToken,
            prefixes: listResponse.prefixes,
            items: (_a = listResponse.items) === null || _a === void 0 ? void 0 : _a.map((item) => new metadata_1.CloudStorageObjectMetadata(item)),
        });
    });
    gcloudStorageAPI.delete(["/b/:bucketId/o/:objectId", "/storage/v1/b/:bucketId/o/:objectId"], async (req, res) => {
        try {
            await adminStorageLayer.deleteObject({
                bucketId: req.params.bucketId,
                decodedObjectId: req.params.objectId,
            });
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError) {
                return sendObjectNotFound(req, res);
            }
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        return res.sendStatus(204);
    });
    gcloudStorageAPI.put("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
        if (!req.query.upload_id) {
            res.sendStatus(400);
            return;
        }
        const uploadId = req.query.upload_id.toString();
        let upload;
        try {
            uploadService.continueResumableUpload(uploadId, await (0, request_1.reqBodyToBuffer)(req));
            upload = uploadService.finalizeResumableUpload(uploadId);
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError) {
                return res.sendStatus(404);
            }
            else if (err instanceof upload_1.UploadNotActiveError) {
                return res.sendStatus(400);
            }
            throw err;
        }
        let metadata;
        try {
            metadata = await adminStorageLayer.uploadObject(upload);
        }
        catch (err) {
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        return res.json(new metadata_1.CloudStorageObjectMetadata(metadata));
    });
    gcloudStorageAPI.post("/b/:bucketId/o/:objectId/acl", async (req, res) => {
        // TODO(abehaskins) Link to a doc with more info
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE).log("WARN_ONCE", "Cloud Storage ACLs are not supported in the Storage Emulator. All related methods will succeed, but have no effect.");
        let getObjectResponse;
        try {
            getObjectResponse = await adminStorageLayer.getObject({
                bucketId: req.params.bucketId,
                decodedObjectId: req.params.objectId,
            });
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError) {
                return sendObjectNotFound(req, res);
            }
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        const { metadata } = getObjectResponse;
        // We do an empty update to step metageneration forward;
        metadata.update({});
        const selfLink = registry_1.EmulatorRegistry.url(types_1.Emulators.STORAGE);
        selfLink.pathname = `/storage/v1/b/${metadata.bucket}/o/${encodeURIComponent(metadata.name)}/acl/allUsers`;
        return res.json({
            kind: "storage#objectAccessControl",
            object: metadata.name,
            id: `${req.params.bucketId}/${metadata.name}/${metadata.generation}/allUsers`,
            selfLink: selfLink.toString(),
            bucket: metadata.bucket,
            entity: req.body.entity,
            role: req.body.role,
            etag: "someEtag",
            generation: metadata.generation.toString(),
        });
    });
    gcloudStorageAPI.post("/upload/storage/v1/b/:bucketId/o", async (req, res) => {
        const uploadType = req.query.uploadType || req.header("X-Goog-Upload-Protocol");
        // Resumable upload protocol.
        if (uploadType === "resumable") {
            const name = getIncomingFileNameFromRequest(req.query, req.body);
            if (name === undefined) {
                res.sendStatus(400);
                return;
            }
            const contentType = req.header("x-upload-content-type");
            const upload = uploadService.startResumableUpload({
                bucketId: req.params.bucketId,
                objectId: name,
                metadata: Object.assign({ contentType }, req.body),
                authorization: req.header("authorization"),
            });
            const uploadUrl = registry_1.EmulatorRegistry.url(types_1.Emulators.STORAGE, req);
            uploadUrl.pathname = `/upload/storage/v1/b/${req.params.bucketId}/o`;
            uploadUrl.searchParams.set("name", name);
            uploadUrl.searchParams.set("uploadType", "resumable");
            uploadUrl.searchParams.set("upload_id", upload.id);
            return res.header("location", uploadUrl.toString()).sendStatus(200);
        }
        async function finalizeOneShotUpload(upload) {
            let metadata;
            try {
                metadata = await adminStorageLayer.uploadObject(upload);
            }
            catch (err) {
                if (err instanceof errors_1.ForbiddenError) {
                    return res.sendStatus(403);
                }
                throw err;
            }
            return res.status(200).json(new metadata_1.CloudStorageObjectMetadata(metadata));
        }
        // Multipart upload protocol.
        if (uploadType === "multipart") {
            const contentTypeHeader = req.header("content-type") || req.header("x-upload-content-type");
            const contentType = req.header("x-upload-content-type");
            if (!contentTypeHeader) {
                return res.sendStatus(400);
            }
            let metadataRaw;
            let dataRaw;
            try {
                ({ metadataRaw, dataRaw } = (0, multipart_1.parseObjectUploadMultipartRequest)(contentTypeHeader, await (0, request_1.reqBodyToBuffer)(req)));
            }
            catch (err) {
                if (err instanceof Error) {
                    return res.status(400).json({
                        error: {
                            code: 400,
                            message: err.message,
                        },
                    });
                }
                throw err;
            }
            const name = getIncomingFileNameFromRequest(req.query, JSON.parse(metadataRaw));
            if (name === undefined) {
                res.sendStatus(400);
                return;
            }
            const upload = uploadService.multipartUpload({
                bucketId: req.params.bucketId,
                objectId: name,
                metadata: Object.assign({ contentType }, JSON.parse(metadataRaw)),
                dataRaw: dataRaw,
                authorization: req.header("authorization"),
            });
            return await finalizeOneShotUpload(upload);
        }
        // Default to media (data-only) upload protocol.
        const name = req.query.name;
        if (!name) {
            res.sendStatus(400);
        }
        const upload = uploadService.mediaUpload({
            bucketId: req.params.bucketId,
            objectId: name.toString(),
            dataRaw: await (0, request_1.reqBodyToBuffer)(req),
            authorization: req.header("authorization"),
        });
        return await finalizeOneShotUpload(upload);
    });
    gcloudStorageAPI.get("/:bucketId/:objectId(**)", async (req, res) => {
        let getObjectResponse;
        try {
            getObjectResponse = await adminStorageLayer.getObject({
                bucketId: req.params.bucketId,
                decodedObjectId: req.params.objectId,
            });
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError) {
                return sendObjectNotFound(req, res);
            }
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        return (0, shared_1.sendFileBytes)(getObjectResponse.metadata, getObjectResponse.data, req, res);
    });
    gcloudStorageAPI.post("/b/:bucketId/o/:objectId/:method(rewriteTo|copyTo)/b/:destBucketId/o/:destObjectId", (req, res, next) => {
        if (req.params.method === "rewriteTo" && req.query.rewriteToken) {
            // Don't yet support multi-request copying
            return next();
        }
        let metadata;
        try {
            metadata = adminStorageLayer.copyObject({
                sourceBucket: req.params.bucketId,
                sourceObject: req.params.objectId,
                destinationBucket: req.params.destBucketId,
                destinationObject: req.params.destObjectId,
                incomingMetadata: req.body,
                // TODO(tonyjhuang): Until we have a way of validating OAuth tokens passed by
                // the GCS sdk or gcloud tool, we must assume all requests have valid admin creds.
                // authorization: req.header("authorization")
                authorization: "Bearer owner",
            });
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError) {
                return sendObjectNotFound(req, res);
            }
            if (err instanceof errors_1.ForbiddenError) {
                return res.sendStatus(403);
            }
            throw err;
        }
        const resource = new metadata_1.CloudStorageObjectMetadata(metadata);
        res.status(200);
        if (req.params.method === "copyTo") {
            // See https://cloud.google.com/storage/docs/json_api/v1/objects/copy#response
            return res.json(resource);
        }
        else if (req.params.method === "rewriteTo") {
            // See https://cloud.google.com/storage/docs/json_api/v1/objects/rewrite#response
            return res.json({
                kind: "storage#rewriteResponse",
                totalBytesRewritten: String(metadata.size),
                objectSize: String(metadata.size),
                done: true,
                resource,
            });
        }
        else {
            return next();
        }
    });
    gcloudStorageAPI.all("/**", (req, res) => {
        if (process.env.STORAGE_EMULATOR_DEBUG) {
            console.table(req.headers);
            console.log(req.method, req.url);
            res.status(501).json("endpoint not implemented");
        }
        else {
            res.sendStatus(501);
        }
    });
    return gcloudStorageAPI;
}
exports.createCloudEndpoints = createCloudEndpoints;
/** Sends 404 matching API */
function sendObjectNotFound(req, res) {
    res.status(404);
    const message = `No such object: ${req.params.bucketId}/${req.params.objectId}`;
    if (req.method === "GET" && req.query.alt === "media") {
        res.send(message);
    }
    else {
        res.json({
            error: {
                code: 404,
                message,
                errors: [
                    {
                        message,
                        domain: "global",
                        reason: "notFound",
                    },
                ],
            },
        });
    }
}
function getIncomingFileNameFromRequest(query, metadata) {
    var _a;
    const name = ((_a = query === null || query === void 0 ? void 0 : query.name) === null || _a === void 0 ? void 0 : _a.toString()) || (metadata === null || metadata === void 0 ? void 0 : metadata.name);
    return (name === null || name === void 0 ? void 0 : name.startsWith("/")) ? name.slice(1) : name;
}
