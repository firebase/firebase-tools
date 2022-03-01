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
  path: string;
  status: UploadStatus;
  metadata: IncomingMetadata;
  size: number;
  authorization?: string;
};

export enum UploadType {
  MULTIPART,
  RESUMABLE,
}

/** The status of an upload. Multipart uploads can only ever be FINISHED. */
export enum UploadStatus {
  ACTIVE,
  CANCELLED,
  FINISHED,
}

/** Request object for {@link UploadService#multipartUpload}. */
export type MultipartUploadRequest = {
  bucketId: string;
  objectId: string;
  metadataRaw: string;
  dataRaw: string;
  authorization?: string;
};

/** Request object for {@link UploadService#startResumableUpload}. */
export type StartResumableUploadRequest = {
  bucketId: string;
  objectId: string;
  metadataRaw: string;
  contentType: string;
  authorization?: string;
};

/** Error that signals a resumable upload that's expected to be active is not. */
export class UploadNotActiveError extends Error {}

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

  /**
   * Handles a multipart file upload which is expected to have the entirety of
   * the file's contents in a single request.
   */
  public multipartUpload(request: MultipartUploadRequest): Upload {
    const data = Buffer.from(request.dataRaw);
    const upload = this.initMultipartUpload(request, data.byteLength);
    this._persistence.deleteFile(upload.path, /* failSilently = */ true);
    this._persistence.appendBytes(upload.path, data);
    return upload;
  }

  private initMultipartUpload(request: MultipartUploadRequest, sizeInBytes: number): Upload {
    const id = uuidV4();
    const upload: Upload = {
      id: uuidV4(),
      bucketId: request.bucketId,
      objectId: request.objectId,
      type: UploadType.MULTIPART,
      path: this.stagingFileName(id, request.bucketId, request.objectId),
      status: UploadStatus.FINISHED,
      metadata: JSON.parse(request.metadataRaw),
      size: sizeInBytes,
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
      path: this.stagingFileName(id, request.bucketId, request.objectId),
      status: UploadStatus.ACTIVE,
      metadata: JSON.parse(request.metadataRaw),
      size: 0,
      authorization: request.authorization,
    };
    this._uploads.set(upload.id, upload);
    this._persistence.deleteFile(upload.path, /* failSilently = */ true);
    return upload;
  }

  /**
   * Appends bytes to an existing resumable upload.
   * @throws {NotFoundError} if the resumable upload does not exist.
   * @throws {NotActiveUploadError} if the resumable upload is not in the ACTIVE state.
   */
  public progressResumableUpload(uploadId: string, dataRaw: string): Upload {
    const upload = this.findResumableUpload(uploadId);
    if (upload.status !== UploadStatus.ACTIVE) {
      throw new UploadNotActiveError();
    }
    const data = Buffer.from(dataRaw);
    this._persistence.appendBytes(upload.path, data);
    upload.size += data.byteLength;
    return upload;
  }

  /**
   * Queries for an existing resumable upload.
   * @throws {NotFoundError} if the resumable upload does not exist.
   */
  public getResumableUpload(uploadId: string): Upload {
    return this.findResumableUpload(uploadId);
  }

  /**
   * Cancels a resumable upload.
   * @throws {NotFoundError} if the resumable upload does not exist.
   * @throws {NotCancellableError} if the resumable upload can not be cancelled.
   */
  public cancelResumableUpload(uploadId: string): Upload {
    const upload = this.findResumableUpload(uploadId);
    if (upload.status === UploadStatus.FINISHED) {
      throw new NotCancellableError();
    }
    upload.status = UploadStatus.CANCELLED;
    return upload;
  }

  /**
   * Marks a ResumableUpload as finalized.
   * @throws {NotFoundError} if the resumable upload does not exist.
   * @throws {NotActiveUploadError} if the resumable upload is not ACTIVE.
   */
  public finalizeResumableUpload(uploadId: string): Upload {
    const upload = this.findResumableUpload(uploadId);
    if (upload.status === UploadStatus.CANCELLED) {
      throw new UploadNotActiveError();
    }
    upload.status = UploadStatus.FINISHED;
    return upload;
  }

  private findResumableUpload(uploadId: string): Upload {
    const upload = this._uploads.get(uploadId);
    if (!upload || upload.type !== UploadType.RESUMABLE) {
      throw new NotFoundError();
    }
    return upload;
  }

  private stagingFileName(uploadId: string, bucketId: string, objectId: string): string {
    return encodeURIComponent(`${uploadId}_b_${bucketId}_o_${objectId}`);
  }
}
