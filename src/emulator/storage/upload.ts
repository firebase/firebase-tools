import { Persistence } from "./persistence";
import { IncomingMetadata } from "./metadata";
import { v4 as uuidV4 } from "uuid";
import { NotFoundError } from "./errors";

/** A file upload. */
export type Upload = {
  id: string;
  bucketId: string;
  objectId: string;
  type: UploadType;
  // Path to where the file is stored on disk. May contain incomplete data if
  // status !== FINISHED.
  path: string;
  status: UploadStatus;
  metadata?: IncomingMetadata;
  size: number;
  authorization?: string;
  prevResponseCode?: number;
};

export enum UploadType {
  MEDIA,
  MULTIPART,
  RESUMABLE,
}

/** The status of an upload. Multipart uploads can only ever be FINISHED. */
export enum UploadStatus {
  ACTIVE = "active",
  CANCELLED = "cancelled",
  FINISHED = "final",
}

/** Request object for {@link UploadService#mediaUpload}. */
export type MediaUploadRequest = {
  bucketId: string;
  objectId: string;
  dataRaw: Buffer;
  authorization?: string;
};

/** Request object for {@link UploadService#multipartUpload}. */
export type MultipartUploadRequest = {
  bucketId: string;
  objectId: string;
  metadata: object;
  dataRaw: Buffer;
  authorization?: string;
};

/** Request object for {@link UploadService#startResumableUpload}. */
export type StartResumableUploadRequest = {
  bucketId: string;
  objectId: string;
  metadata: object;
  authorization?: string;
};

type OneShotUploadRequest = {
  bucketId: string;
  objectId: string;
  uploadType: UploadType;
  dataRaw: Buffer;
  metadata?: any;
  authorization?: string;
};

/** Error that signals a resumable upload that's expected to be active is not. */
export class UploadNotActiveError extends Error {}

/** Error that signals a resumable upload that shouldn't be finalized is. */
export class UploadPreviouslyFinalizedError extends Error {}

/** Error that signals a resumable upload is not cancellable.  */
export class NotCancellableError extends Error {}

/**
 * Service that handles byte transfer and maintains state for file uploads.
 *
 * New file uploads will be persisted to a temp staging directory which will not
 * survive across emulator restarts. Clients are expected to move staged files
 * to a more permanent location.
 */
export class UploadService {
  private _uploads!: Map<string, Upload>;
  constructor(private _persistence: Persistence) {
    this.reset();
  }

  /** Resets the state of the UploadService. */
  public reset(): void {
    this._uploads = new Map();
  }

  /** Handles a media (data-only) file upload. */
  public mediaUpload(request: MediaUploadRequest): Upload {
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
  public multipartUpload(request: MultipartUploadRequest): Upload {
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

  private startOneShotUpload(request: OneShotUploadRequest): Upload {
    const id = uuidV4();
    const upload: Upload = {
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
  public startResumableUpload(request: StartResumableUploadRequest): Upload {
    const id = uuidV4();
    const upload: Upload = {
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
  public continueResumableUpload(uploadId: string, dataRaw: Buffer): Upload {
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
  public getResumableUpload(uploadId: string): Upload {
    const upload = this._uploads.get(uploadId);
    if (!upload || upload.type !== UploadType.RESUMABLE) {
      throw new NotFoundError();
    }
    return upload;
  }

  /**
   * Cancels a resumable upload.
   * @throws {NotFoundError} if the resumable upload does not exist.
   * @throws {NotCancellableError} if the resumable upload can not be cancelled.
   */
  public cancelResumableUpload(uploadId: string): Upload {
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
  public finalizeResumableUpload(uploadId: string): Upload {
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
  public setResponseCode(uploadId: string, code: number): void {
    const upload = this._uploads.get(uploadId);
    if (upload) {
      upload.prevResponseCode = code;
    }
  }

  /**
   * Gets previous response code.
   * In the case the uploadId doesn't exist (after importing) return 200
   */
  public getPreviousResponseCode(uploadId: string): number {
    return this._uploads.get(uploadId)?.prevResponseCode || 200;
  }

  private getStagingFileName(uploadId: string, bucketId: string, objectId: string): string {
    return encodeURIComponent(`${uploadId}_b_${bucketId}_o_${objectId}`);
  }
}
