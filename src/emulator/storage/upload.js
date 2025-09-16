"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = exports.NotCancellableError = exports.UploadPreviouslyFinalizedError = exports.UploadNotActiveError = exports.UploadStatus = exports.UploadType = void 0;
const uuid_1 = require("uuid");
const errors_1 = require("./errors");
var UploadType;
(function (UploadType) {
    UploadType[UploadType["MEDIA"] = 0] = "MEDIA";
    UploadType[UploadType["MULTIPART"] = 1] = "MULTIPART";
    UploadType[UploadType["RESUMABLE"] = 2] = "RESUMABLE";
})(UploadType = exports.UploadType || (exports.UploadType = {}));
/** The status of an upload. Multipart uploads can only ever be FINISHED. */
var UploadStatus;
(function (UploadStatus) {
    UploadStatus["ACTIVE"] = "active";
    UploadStatus["CANCELLED"] = "cancelled";
    UploadStatus["FINISHED"] = "final";
})(UploadStatus = exports.UploadStatus || (exports.UploadStatus = {}));
/** Error that signals a resumable upload that's expected to be active is not. */
class UploadNotActiveError extends Error {
}
exports.UploadNotActiveError = UploadNotActiveError;
/** Error that signals a resumable upload that shouldn't be finalized is. */
class UploadPreviouslyFinalizedError extends Error {
}
exports.UploadPreviouslyFinalizedError = UploadPreviouslyFinalizedError;
/** Error that signals a resumable upload is not cancellable.  */
class NotCancellableError extends Error {
}
exports.NotCancellableError = NotCancellableError;
/**
 * Service that handles byte transfer and maintains state for file uploads.
 *
 * New file uploads will be persisted to a temp staging directory which will not
 * survive across emulator restarts. Clients are expected to move staged files
 * to a more permanent location.
 */
class UploadService {
    constructor(_persistence) {
        this._persistence = _persistence;
        this.reset();
    }
    /** Resets the state of the UploadService. */
    reset() {
        this._uploads = new Map();
    }
    /** Handles a media (data-only) file upload. */
    mediaUpload(request) {
        const upload = this.startOneShotUpload({
            bucketId: request.bucketId,
            objectId: request.objectId,
            uploadType: UploadType.MEDIA,
            dataRaw: request.dataRaw,
            authorization: request.authorization,
        });
        this._persistence.deleteFile(upload.path, /* failSilently = */ true);
        this._persistence.appendBytes(upload.path, request.dataRaw);
        return upload;
    }
    /**
     * Handles a multipart file upload which is expected to have the entirety of
     * the file's contents in a single request.
     */
    multipartUpload(request) {
        const upload = this.startOneShotUpload({
            bucketId: request.bucketId,
            objectId: request.objectId,
            uploadType: UploadType.MULTIPART,
            dataRaw: request.dataRaw,
            metadata: request.metadata,
            authorization: request.authorization,
        });
        this._persistence.deleteFile(upload.path, /* failSilently = */ true);
        this._persistence.appendBytes(upload.path, request.dataRaw);
        return upload;
    }
    startOneShotUpload(request) {
        const id = (0, uuid_1.v4)();
        const upload = {
            id,
            bucketId: request.bucketId,
            objectId: request.objectId,
            type: request.uploadType,
            path: this.getStagingFileName(id, request.bucketId, request.objectId),
            status: UploadStatus.FINISHED,
            metadata: request.metadata,
            size: request.dataRaw.byteLength,
            authorization: request.authorization,
        };
        this._uploads.set(upload.id, upload);
        return upload;
    }
    /**
     * Initializes a new ResumableUpload.
     */
    startResumableUpload(request) {
        const id = (0, uuid_1.v4)();
        const upload = {
            id: id,
            bucketId: request.bucketId,
            objectId: request.objectId,
            type: UploadType.RESUMABLE,
            path: this.getStagingFileName(id, request.bucketId, request.objectId),
            status: UploadStatus.ACTIVE,
            metadata: request.metadata,
            size: 0,
            authorization: request.authorization,
        };
        this._uploads.set(upload.id, upload);
        this._persistence.deleteFile(upload.path, /* failSilently = */ true);
        // create empty file to append to later
        this._persistence.appendBytes(upload.path, Buffer.alloc(0));
        return upload;
    }
    /**
     * Appends bytes to an existing resumable upload.
     * @throws {NotFoundError} if the resumable upload does not exist.
     * @throws {NotActiveUploadError} if the resumable upload is not in the ACTIVE state.
     */
    continueResumableUpload(uploadId, dataRaw) {
        const upload = this.getResumableUpload(uploadId);
        if (upload.status !== UploadStatus.ACTIVE) {
            throw new UploadNotActiveError();
        }
        this._persistence.appendBytes(upload.path, dataRaw);
        upload.size += dataRaw.byteLength;
        return upload;
    }
    /**
     * Queries for an existing resumable upload.
     * @throws {NotFoundError} if the resumable upload does not exist.
     */
    getResumableUpload(uploadId) {
        const upload = this._uploads.get(uploadId);
        if (!upload || upload.type !== UploadType.RESUMABLE) {
            throw new errors_1.NotFoundError();
        }
        return upload;
    }
    /**
     * Cancels a resumable upload.
     * @throws {NotFoundError} if the resumable upload does not exist.
     * @throws {NotCancellableError} if the resumable upload can not be cancelled.
     */
    cancelResumableUpload(uploadId) {
        const upload = this.getResumableUpload(uploadId);
        if (upload.status === UploadStatus.FINISHED) {
            throw new NotCancellableError();
        }
        upload.status = UploadStatus.CANCELLED;
        return upload;
    }
    /**
     * Marks a ResumableUpload as finalized.
     * @throws {NotFoundError} if the resumable upload does not exist.
     * @throws {UploadNotActiveError} if the resumable upload is not ACTIVE.
     * @throws {UploadPreviouslyFinalizedError} if the resumable upload has already been finalized.
     */
    finalizeResumableUpload(uploadId) {
        const upload = this.getResumableUpload(uploadId);
        if (upload.status === UploadStatus.FINISHED) {
            throw new UploadPreviouslyFinalizedError();
        }
        if (upload.status === UploadStatus.CANCELLED) {
            throw new UploadNotActiveError();
        }
        upload.status = UploadStatus.FINISHED;
        return upload;
    }
    /**
     * Sets previous response code.
     */
    setResponseCode(uploadId, code) {
        const upload = this._uploads.get(uploadId);
        if (upload) {
            upload.prevResponseCode = code;
        }
    }
    /**
     * Gets previous response code.
     * In the case the uploadId doesn't exist (after importing) return 200
     */
    getPreviousResponseCode(uploadId) {
        return this._uploads.get(uploadId)?.prevResponseCode || 200;
    }
    getStagingFileName(uploadId, bucketId, objectId) {
        return encodeURIComponent(`${uploadId}_b_${bucketId}_o_${objectId}`);
    }
}
exports.UploadService = UploadService;
//# sourceMappingURL=upload.js.map