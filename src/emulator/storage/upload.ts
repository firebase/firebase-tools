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
  path: string;
  // Undefined if upload type is MULTIPART, as MULTIPART uploads are always finished.
  resumableStatus?: ResumableUploadStatus;
  metadata?: IncomingMetadata;
  data: Buffer;
  authorization?: string;
};

export enum UploadType {
  MULTIPART,
  RESUMABLE,
}

/** The status of a resumable upload. This enum is not applicable to multipart uploads. */
export enum ResumableUploadStatus {
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
  metadata: IncomingMetadata;
  contentType: string;
  authorization?: string;
};

/** Error that signals a resumable upload that's expected to be active is not. */
export class NotActiveUploadError extends Error {}

/** Error that signals a resumable upload is not cancellable.  */
export class NotCancellableError extends Error {}

/**
 * Service that handles byte transfer and maintains state for file uploads.
 *
 * New file uploads will be persisted to a temp staging directory which will not
 * survive across emulator restarts. Clients should are expected to move staged
 * files to a more permanent location.
 */
export class UploadService {
  private _uploads!: Map<string, Upload>;
  constructor(private _persistence: Persistence) {
    this._uploads = new Map();
  }

  /**
   * Handles a multipart file upload which is expected to have the entirety of
   * the file's contents in a single request.
   */
  public multipartUpload(request: MultipartUploadRequest): Upload {
    const upload = this.initMultipartUpload(request);
    this._persistence.deleteFile(upload.path, /* failSilently = */ true);
    this._persistence.appendBytes(upload.path, upload.data);
    return upload;
  }

  private initMultipartUpload(request: MultipartUploadRequest): Upload {
    const id = uuidV4();
    const upload: Upload = {
      id: uuidV4(),
      bucketId: request.bucketId,
      objectId: request.objectId,
      type: UploadType.MULTIPART,
      path: this.stagingFileName(id, request.bucketId, request.objectId),
      resumableStatus: undefined,
      metadata: JSON.parse(request.metadataRaw),
      data: Buffer.from(request.dataRaw),
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
      resumableStatus: ResumableUploadStatus.ACTIVE,
      metadata: request.metadata,
      data: Buffer.of(),
      authorization: request.authorization,
    };
    this._uploads.set(upload.id, upload);
    this._persistence.deleteFile(upload.path, /* failSilently = */ true);
    return upload;
  }

  /**
   * Appends bytes to an existing resumable.
   * @throws {NotFoundError} if the resumable upload does not exist.
   * @throws {NotActiveUploadError} if the resumable upload is not in the ACTIVE state.
   */
  public progressResumableUpload(uploadId: string, dataRaw: string): Upload {
    const upload = this.findResumableUpload(uploadId);
    if (upload.resumableStatus !== ResumableUploadStatus.ACTIVE) {
      throw new NotActiveUploadError();
    }
    this._persistence.appendBytes(upload.path, Buffer.from(dataRaw));
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
    if (upload.resumableStatus === ResumableUploadStatus.FINISHED) {
      throw new NotCancellableError();
    }
    upload.resumableStatus = ResumableUploadStatus.CANCELLED;
    return upload;
  }

  /**
   * Marks a ResumableUpload as finalized.
   */
  public finalizeResumableUpload(uploadId: string): Upload {
    const upload = this.findResumableUpload(uploadId);
    if (upload.resumableStatus === ResumableUploadStatus.CANCELLED) {
      throw new NotActiveUploadError();
    }
    upload.resumableStatus = ResumableUploadStatus.FINISHED;
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
