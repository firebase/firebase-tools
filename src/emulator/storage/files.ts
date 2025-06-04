import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import {
  CloudStorageBucketMetadata,
  CloudStorageObjectMetadata,
  IncomingMetadata,
  StoredFileMetadata,
} from "./metadata";
import { NotFoundError, ForbiddenError } from "./errors";
import * as path from "path";
import * as fse from "fs-extra";
import { StorageCloudFunctions } from "./cloudFunctions";
import { logger } from "../../logger";
import {
  constructDefaultAdminSdkConfig,
  getProjectAdminSdkConfigOrCached,
} from "../adminSdkConfig";
import { RulesetOperationMethod } from "./rules/types";
import { AdminCredentialValidator, FirebaseRulesValidator } from "./rules/utils";
import { Persistence } from "./persistence";
import { Upload, UploadStatus } from "./upload";
import { trackEmulator } from "../../track";
import { Emulators } from "../types";

interface BucketsList {
  buckets: {
    id: string;
  }[];
}

export class StoredFile {
  private _metadata!: StoredFileMetadata;
  public get metadata(): StoredFileMetadata {
    return this._metadata;
  }
  public set metadata(value: StoredFileMetadata) {
    this._metadata = value;
  }
  constructor(metadata: StoredFileMetadata) {
    this.metadata = metadata;
  }
}

/**  Parsed request object for {@link StorageLayer#getObject}. */
export type GetObjectRequest = {
  bucketId: string;
  decodedObjectId: string;
  authorization?: string;
  downloadToken?: string;
};

/** Response object for {@link StorageLayer#getObject}. */
export type GetObjectResponse = {
  metadata: StoredFileMetadata;
  data: Buffer;
};

/**  Parsed request object for {@link StorageLayer#updateObjectMetadata}. */
export type UpdateObjectMetadataRequest = {
  bucketId: string;
  decodedObjectId: string;
  metadata: IncomingMetadata;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#deleteObject}. */
export type DeleteObjectRequest = {
  bucketId: string;
  decodedObjectId: string;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#listObjects}. */
export type ListObjectsRequest = {
  bucketId: string;
  prefix: string;
  delimiter: string;
  pageToken?: string;
  maxResults?: number;
  authorization?: string;
};

/** Response object for {@link StorageLayer#listObjects}. */
export type ListObjectsResponse = {
  prefixes?: string[];
  items?: StoredFileMetadata[];
  nextPageToken?: string;
};

/**  Parsed request object for {@link StorageLayer#createDownloadToken}. */
export type CreateDownloadTokenRequest = {
  bucketId: string;
  decodedObjectId: string;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#deleteDownloadToken}. */
export type DeleteDownloadTokenRequest = {
  bucketId: string;
  decodedObjectId: string;
  token: string;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#copyObject}. */
export type CopyObjectRequest = {
  sourceBucket: string;
  sourceObject: string;
  destinationBucket: string;
  destinationObject: string;
  incomingMetadata?: IncomingMetadata;
  authorization?: string;
};

// Matches any number of "/" at the end of a string.
const TRAILING_SLASHES_PATTERN = /\/+$/;

export class StorageLayer {
  constructor(
    private _projectId: string,
    private _files: Map<string, StoredFile>,
    private _buckets: Map<string, CloudStorageBucketMetadata>,
    private _rulesValidator: FirebaseRulesValidator,
    private _adminCredsValidator: AdminCredentialValidator,
    private _persistence: Persistence,
    private _cloudFunctions: StorageCloudFunctions,
  ) {}

  createBucket(id: string): void {
    if (!this._buckets.has(id)) {
      this._buckets.set(id, new CloudStorageBucketMetadata(id));
    }
  }

  async listBuckets(): Promise<CloudStorageBucketMetadata[]> {
    if (this._buckets.size === 0) {
      let adminSdkConfig = await getProjectAdminSdkConfigOrCached(this._projectId);
      if (!adminSdkConfig) {
        adminSdkConfig = constructDefaultAdminSdkConfig(this._projectId);
      }
      this.createBucket(adminSdkConfig.storageBucket!);
    }

    return [...this._buckets.values()];
  }

  /**
   * Returns an stored object and its metadata.
   * @throws {NotFoundError} if object does not exist
   * @throws {ForbiddenError} if request is unauthorized
   */
  public async getObject(request: GetObjectRequest): Promise<GetObjectResponse> {
    const metadata = this.getMetadata(request.bucketId, request.decodedObjectId);

    // If a valid download token is present, skip Firebase Rules auth. Mainly used by the js sdk.
    const hasValidDownloadToken = (metadata?.downloadTokens || []).includes(
      request.downloadToken ?? "",
    );
    let authorized = hasValidDownloadToken;
    if (!authorized) {
      authorized = await this._rulesValidator.validate(
        ["b", request.bucketId, "o", request.decodedObjectId].join("/"),
        request.bucketId,
        RulesetOperationMethod.GET,
        { before: metadata?.asRulesResource() },
        this._projectId,
        request.authorization,
      );
    }
    if (!authorized) {
      throw new ForbiddenError("Failed auth");
    }

    if (!metadata) {
      throw new NotFoundError("File not found");
    }

    return { metadata: metadata!, data: this.getBytes(request.bucketId, request.decodedObjectId)! };
  }

  private getMetadata(bucket: string, object: string): StoredFileMetadata | undefined {
    const key = this.path(bucket, object);
    const val = this._files.get(key);

    if (val) {
      return val.metadata;
    }

    return;
  }

  private getBytes(
    bucket: string,
    object: string,
    size?: number,
    offset?: number,
  ): Buffer | undefined {
    const key = this.path(bucket, object);
    const val = this._files.get(key);
    if (val) {
      const len = size ? size : Number(val.metadata.size);
      return this._persistence.readBytes(this.path(bucket, object), len, offset);
    }
    return undefined;
  }
  /**
   * Deletes an object.
   * @throws {ForbiddenError} if the request is not authorized.
   * @throws {NotFoundError} if the object does not exist.
   */
  public async deleteObject(request: DeleteObjectRequest): Promise<void> {
    const storedMetadata = this.getMetadata(request.bucketId, request.decodedObjectId);
    const authorized = await this._rulesValidator.validate(
      ["b", request.bucketId, "o", request.decodedObjectId].join("/"),
      request.bucketId,
      RulesetOperationMethod.DELETE,
      { before: storedMetadata?.asRulesResource() },
      this._projectId,
      request.authorization,
    );
    if (!authorized) {
      throw new ForbiddenError();
    }
    if (!storedMetadata) {
      throw new NotFoundError();
    }
    this.deleteFile(request.bucketId, request.decodedObjectId);
  }

  private deleteFile(bucketId: string, objectId: string): boolean {
    const isFolder = objectId.toLowerCase().endsWith("%2f");

    if (isFolder) {
      objectId = objectId.slice(0, -3);
    }

    let filePath = this.path(bucketId, objectId);

    if (isFolder) {
      filePath += "%2F";
    }

    const file = this._files.get(filePath);

    if (file === undefined) {
      return false;
    } else {
      this._files.delete(filePath);
      this._persistence.deleteFile(filePath);

      this._cloudFunctions.dispatch("delete", new CloudStorageObjectMetadata(file.metadata));
      return true;
    }
  }

  /**
   * Updates an existing object's metadata.
   * @throws {ForbiddenError} if the request is not authorized.
   * @throws {NotFoundError} if the object does not exist.
   */
  public async updateObjectMetadata(
    request: UpdateObjectMetadataRequest,
  ): Promise<StoredFileMetadata> {
    const storedMetadata = this.getMetadata(request.bucketId, request.decodedObjectId);
    const authorized = await this._rulesValidator.validate(
      ["b", request.bucketId, "o", request.decodedObjectId].join("/"),
      request.bucketId,
      RulesetOperationMethod.UPDATE,
      {
        before: storedMetadata?.asRulesResource(),
        after: storedMetadata?.asRulesResource(request.metadata),
      },
      this._projectId,
      request.authorization,
    );
    if (!authorized) {
      throw new ForbiddenError();
    }
    if (!storedMetadata) {
      throw new NotFoundError();
    }

    storedMetadata.update(request.metadata);
    return storedMetadata;
  }

  /**
   * Last step in uploading a file. Validates the request and persists the staging
   * object to its permanent location on disk, updates metadata.
   */
  public async uploadObject(upload: Upload): Promise<StoredFileMetadata> {
    if (upload.status !== UploadStatus.FINISHED) {
      throw new Error(`Unexpected upload status encountered: ${upload.status}.`);
    }

    const storedMetadata = this.getMetadata(upload.bucketId, upload.objectId);
    const filePath = this.path(upload.bucketId, upload.objectId);
    // Pulls fields out of upload.metadata and ignores null values.
    function getIncomingMetadata(field: string): any {
      if (!upload.metadata) {
        return undefined;
      }
      const value: any | undefined = (upload.metadata! as any)[field];
      return value === null ? undefined : value;
    }
    const metadata = new StoredFileMetadata(
      {
        name: upload.objectId,
        bucket: upload.bucketId,
        contentType: getIncomingMetadata("contentType"),
        contentDisposition: getIncomingMetadata("contentDisposition"),
        contentEncoding: getIncomingMetadata("contentEncoding"),
        contentLanguage: getIncomingMetadata("contentLanguage"),
        cacheControl: getIncomingMetadata("cacheControl"),
        customMetadata: getIncomingMetadata("metadata"),
      },
      this._cloudFunctions,
      this._persistence.readBytes(upload.path, upload.size),
    );

    const authorized = await this._rulesValidator.validate(
      ["b", upload.bucketId, "o", upload.objectId].join("/"),
      upload.bucketId,
      RulesetOperationMethod.CREATE,
      {
        before: storedMetadata?.asRulesResource(),
        after: metadata.asRulesResource(),
      },
      this._projectId,
      upload.authorization,
    );
    if (!authorized) {
      this._persistence.deleteFile(upload.path);
      throw new ForbiddenError();
    }

    // Persist to permanent location on disk.
    this._persistence.deleteFile(filePath, /* failSilently = */ true);
    this._persistence.renameFile(upload.path, filePath);
    this._files.set(filePath, new StoredFile(metadata));
    this._cloudFunctions.dispatch("finalize", new CloudStorageObjectMetadata(metadata));
    return metadata;
  }

  public copyObject({
    sourceBucket,
    sourceObject,
    destinationBucket,
    destinationObject,
    incomingMetadata,
    authorization,
  }: CopyObjectRequest): StoredFileMetadata {
    if (!this._adminCredsValidator.validate(authorization)) {
      throw new ForbiddenError();
    }
    const sourceMetadata = this.getMetadata(sourceBucket, sourceObject);
    if (!sourceMetadata) {
      throw new NotFoundError();
    }
    const sourceBytes = this.getBytes(sourceBucket, sourceObject) as Buffer;

    const destinationFilePath = this.path(destinationBucket, destinationObject);
    this._persistence.deleteFile(destinationFilePath, /* failSilently = */ true);
    this._persistence.appendBytes(destinationFilePath, sourceBytes);

    const newMetadata: IncomingMetadata = {
      ...sourceMetadata,
      metadata: sourceMetadata.customMetadata,
      ...incomingMetadata,
    };
    if (
      sourceMetadata.downloadTokens.length &&
      // Only copy download tokens if we're not overwriting any custom metadata
      !(incomingMetadata?.metadata && Object.keys(incomingMetadata?.metadata).length)
    ) {
      if (!newMetadata.metadata) newMetadata.metadata = {};
      newMetadata.metadata.firebaseStorageDownloadTokens = sourceMetadata.downloadTokens.join(",");
    }
    if (newMetadata.metadata) {
      // Convert null metadata values to empty strings
      for (const [k, v] of Object.entries(newMetadata.metadata)) {
        if (v === null) newMetadata.metadata[k] = "";
      }
    }

    // Pulls fields out of newMetadata and ignores null values.
    function getMetadata(field: string): any {
      const value: any | undefined = (newMetadata as any)[field];
      return value === null ? undefined : value;
    }
    const copiedFileMetadata = new StoredFileMetadata(
      {
        name: destinationObject,
        bucket: destinationBucket,
        contentType: getMetadata("contentType"),
        contentDisposition: getMetadata("contentDisposition"),
        contentEncoding: getMetadata("contentEncoding"),
        contentLanguage: getMetadata("contentLanguage"),
        cacheControl: getMetadata("cacheControl"),
        customMetadata: getMetadata("metadata"),
      },
      this._cloudFunctions,
      sourceBytes,
    );
    const file = new StoredFile(copiedFileMetadata);
    this._files.set(destinationFilePath, file);

    this._cloudFunctions.dispatch("finalize", new CloudStorageObjectMetadata(file.metadata));
    return file.metadata;
  }

  /**
   * Lists all files and prefixes (folders) at a path.
   * @throws {ForbiddenError} if the request is not authorized.
   */
  public async listObjects(request: ListObjectsRequest): Promise<ListObjectsResponse> {
    const { bucketId, prefix, delimiter, pageToken, authorization } = request;

    const authorized = await this._rulesValidator.validate(
      // Firebase Rules expects the path without trailing slashes.
      ["b", bucketId, "o", prefix.replace(TRAILING_SLASHES_PATTERN, "")].join("/"),
      bucketId,
      RulesetOperationMethod.LIST,
      {},
      this._projectId,
      authorization,
      delimiter,
    );
    if (!authorized) {
      throw new ForbiddenError();
    }

    let items: Array<StoredFileMetadata> = [];
    const prefixes = new Set<string>();
    for (const [, file] of this._files) {
      if (file.metadata.bucket !== bucketId) {
        continue;
      }

      const name = file.metadata.name;
      if (!name.startsWith(prefix)) {
        continue;
      }

      let includeMetadata = true;
      if (delimiter) {
        const delimiterIdx = name.indexOf(delimiter);
        const delimiterAfterPrefixIdx = name.indexOf(delimiter, prefix.length);
        // items[] contains object metadata for objects whose names do not contain
        // delimiter, or whose names only have instances of delimiter in their prefix.
        includeMetadata = delimiterIdx === -1 || delimiterAfterPrefixIdx === -1;
        if (delimiterAfterPrefixIdx !== -1) {
          // prefixes[] contains truncated object names for objects whose names contain
          // delimiter after any prefix. Object names are truncated beyond the first
          // applicable instance of the delimiter.
          prefixes.add(name.slice(0, delimiterAfterPrefixIdx + delimiter.length));
        }
      }

      if (includeMetadata) {
        items.push(file.metadata);
      }
    }

    // Order items by name
    items.sort((a, b) => {
      if (a.name === b.name) {
        return 0;
      } else if (a.name < b.name) {
        return -1;
      } else {
        return 1;
      }
    });
    if (pageToken) {
      const idx = items.findIndex((v) => v.name === pageToken);
      if (idx !== -1) {
        items = items.slice(idx);
      }
    }

    const maxResults = request.maxResults ?? 1000;
    let nextPageToken = undefined;
    if (items.length > maxResults) {
      nextPageToken = items[maxResults].name;
      items = items.slice(0, maxResults);
    }

    return {
      nextPageToken,
      prefixes: prefixes.size > 0 ? [...prefixes].sort() : undefined,
      items: items.length > 0 ? items : undefined,
    };
  }

  /** Creates a new Firebase download token for an object. */
  public createDownloadToken(request: CreateDownloadTokenRequest): StoredFileMetadata {
    if (!this._adminCredsValidator.validate(request.authorization)) {
      throw new ForbiddenError();
    }
    const metadata = this.getMetadata(request.bucketId, request.decodedObjectId);
    if (!metadata) {
      throw new NotFoundError();
    }
    metadata.addDownloadToken();
    return metadata;
  }

  /**
   * Removes a Firebase download token from an object's metadata. If the token is not already
   * present, calling this method is a no-op. This method will also regenerate a new token
   * if the last remaining token is deleted.
   */
  public deleteDownloadToken(request: DeleteDownloadTokenRequest): StoredFileMetadata {
    if (!this._adminCredsValidator.validate(request.authorization)) {
      throw new ForbiddenError();
    }
    const metadata = this.getMetadata(request.bucketId, request.decodedObjectId);
    if (!metadata) {
      throw new NotFoundError();
    }
    metadata.deleteDownloadToken(request.token);
    return metadata;
  }

  private path(bucket: string, object: string): string {
    return path.join(bucket, object);
  }

  public get dirPath(): string {
    return this._persistence.dirPath;
  }

  /**
   * Export is implemented using async operations so that it does not block
   * the hub when invoked.
   */
  async export(storageExportPath: string, options: { initiatedBy: string }): Promise<void> {
    // Export a list of all known bucket IDs, which can be used to reconstruct
    // the bucket metadata.
    const bucketsList: BucketsList = {
      buckets: [],
    };
    for (const b of await this.listBuckets()) {
      bucketsList.buckets.push({ id: b.id });
    }
    void trackEmulator("emulator_export", {
      initiated_by: options.initiatedBy,
      emulator_name: Emulators.STORAGE,
      count: bucketsList.buckets.length,
    });
    // Resulting path is platform-specific, e.g. foo%5Cbar on Windows, foo%2Fbar on Linux
    // after URI encoding. Similarly for metadata paths below.
    const bucketsFilePath = path.join(storageExportPath, "buckets.json");
    await fse.writeFile(bucketsFilePath, JSON.stringify(bucketsList, undefined, 2));

    // Create blobs directory
    const blobsDirPath = path.join(storageExportPath, "blobs");
    await fse.ensureDir(blobsDirPath);

    // Create metadata directory
    const metadataDirPath = path.join(storageExportPath, "metadata");
    await fse.ensureDir(metadataDirPath);

    // Copy data into metadata and blobs directory
    for await (const [, file] of this._files.entries()) {
      // get diskFilename from file path, metadata and blob files are persisted with this name
      const diskFileName = this._persistence.getDiskFileName(
        this.path(file.metadata.bucket, file.metadata.name),
      );

      await fse.copy(path.join(this.dirPath, diskFileName), path.join(blobsDirPath, diskFileName));
      const metadataExportPath =
        path.join(metadataDirPath, encodeURIComponent(diskFileName)) + ".json";
      await fse.writeFile(metadataExportPath, StoredFileMetadata.toJSON(file.metadata));
    }
  }

  /**
   * Import can be implemented using sync operations because the emulator should
   * not be handling any other requests during import.
   */
  import(storageExportPath: string, options: { initiatedBy: string }): void {
    // Restore list of buckets
    const bucketsFile = path.join(storageExportPath, "buckets.json");
    const bucketsList = JSON.parse(readFileSync(bucketsFile, "utf-8")) as BucketsList;
    void trackEmulator("emulator_import", {
      initiated_by: options.initiatedBy,
      emulator_name: Emulators.STORAGE,
      count: bucketsList.buckets.length,
    });

    for (const b of bucketsList.buckets) {
      const bucketMetadata = new CloudStorageBucketMetadata(b.id);
      this._buckets.set(b.id, bucketMetadata);
    }

    const metadataDir = path.join(storageExportPath, "metadata");
    const blobsDir = path.join(storageExportPath, "blobs");

    // Handle case where export contained empty metadata or blobs
    if (!existsSync(metadataDir) || !existsSync(blobsDir)) {
      logger.warn(
        `Could not find metadata directory at "${metadataDir}" and/or blobs directory at "${blobsDir}".`,
      );
      return;
    }

    // Restore all metadata
    const metadataList = this.walkDirSync(metadataDir);

    const dotJson = ".json";
    for (const f of metadataList) {
      if (path.extname(f) !== dotJson) {
        logger.debug(`Skipping unexpected storage metadata file: ${f}`);
        continue;
      }
      const metadata = StoredFileMetadata.fromJSON(readFileSync(f, "utf-8"), this._cloudFunctions);

      // To get the blob path from the metadata path:
      // 1) Get the relative path to the metadata export dir
      // 2) Subtract .json from the end
      const metadataRelPath = path.relative(metadataDir, f);
      const blobPath = metadataRelPath.substring(0, metadataRelPath.length - dotJson.length);

      const blobAbsPath = path.join(blobsDir, blobPath);
      if (!existsSync(blobAbsPath)) {
        logger.warn(`Could not find file "${blobPath}" in storage export.`);
        continue;
      }

      let fileName = metadata.name;
      const objectNameSep = getPathSep(fileName);
      // Replace all file separators with that of current platform for compatibility
      if (fileName !== path.sep) {
        fileName = fileName.split(objectNameSep).join(path.sep);
      }

      const filepath = this.path(metadata.bucket, fileName);

      this._persistence.copyFromExternalPath(blobAbsPath, filepath);
      this._files.set(filepath, new StoredFile(metadata));
    }
  }

  private *walkDirSync(dir: string): Generator<string> {
    const files = readdirSync(dir);
    for (const file of files) {
      const p = path.join(dir, file);
      if (statSync(p).isDirectory()) {
        yield* this.walkDirSync(p);
      } else {
        yield p;
      }
    }
  }
}

/** Returns file separator used in given path, either '\\' or '/'. */
function getPathSep(decodedPath: string): string {
  // Checks for the first matching file separator
  const firstSepIndex = decodedPath.search(/[\/|\\\\]/g);
  return decodedPath[firstSepIndex];
}
