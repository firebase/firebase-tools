import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { v4 } from "uuid";
import { ListItem, ListResponse } from "./list";
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
import { AdminCredentialValidator, RulesValidator } from "./rules/utils";
import { Persistence } from "./persistence";
import { Upload, UploadStatus } from "./upload";

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
  private _path: string;

  constructor(metadata: StoredFileMetadata, path: string) {
    this.metadata = metadata;
    this._path = path;
  }
  public get path(): string {
    return this._path;
  }
  public set path(value: string) {
    this._path = value;
  }
}

/**  Parsed request object for {@link StorageLayer#handleGetObject}. */
export type GetObjectRequest = {
  bucketId: string;
  decodedObjectId: string;
  authorization?: string;
  downloadToken?: string;
};

/** Response object for {@link StorageLayer#handleGetObject}. */
export type GetObjectResponse = {
  metadata: StoredFileMetadata;
  data: Buffer;
};

/**  Parsed request object for {@link StorageLayer#handleUpdateObjectMetadata}. */
export type UpdateObjectMetadataRequest = {
  bucketId: string;
  decodedObjectId: string;
  metadata: IncomingMetadata;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#handleDeleteObject}. */
export type DeleteObjectRequest = {
  bucketId: string;
  decodedObjectId: string;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#handleListObjects}. */
export type ListObjectsRequest = {
  bucketId: string;
  prefix: string;
  delimiter: string;
  pageToken?: string;
  maxResults?: number;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#handleCreateDownloadToken}. */
export type CreateDownloadTokenRequest = {
  bucketId: string;
  decodedObjectId: string;
  authorization?: string;
};

/**  Parsed request object for {@link StorageLayer#handleDeleteDownloadToken}. */
export type DeleteDownloadTokenRequest = {
  bucketId: string;
  decodedObjectId: string;
  token: string;
  authorization?: string;
};

export class StorageLayer {
  private _files!: Map<string, StoredFile>;
  private _buckets!: Map<string, CloudStorageBucketMetadata>;
  private _cloudFunctions: StorageCloudFunctions;

  constructor(
    private _projectId: string,
    private _rulesValidator: RulesValidator,
    private _adminCredsValidator: AdminCredentialValidator,
    private _persistence: Persistence
  ) {
    this.reset();
    this._cloudFunctions = new StorageCloudFunctions(this._projectId);
  }

  public reset(): void {
    this._files = new Map();
    this._buckets = new Map();
  }

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
  public async handleGetObject(
    request: GetObjectRequest,
    skipAuth = false
  ): Promise<GetObjectResponse> {
    const metadata = this.getMetadata(request.bucketId, request.decodedObjectId);

    // If a valid download token is present, skip Firebase Rules auth. Mainly used by the js sdk.
    const hasValidDownloadToken = (metadata?.downloadTokens || []).includes(
      request.downloadToken ?? ""
    );
    let authorized = skipAuth || hasValidDownloadToken;
    if (!authorized) {
      authorized = await this._rulesValidator.validate(
        ["b", request.bucketId, "o", request.decodedObjectId].join("/"),
        request.bucketId,
        RulesetOperationMethod.GET,
        { before: metadata?.asRulesResource() },
        request.authorization
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

  public getMetadata(bucket: string, object: string): StoredFileMetadata | undefined {
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
    offset?: number
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
  public async handleDeleteObject(request: DeleteObjectRequest, skipAuth = false): Promise<void> {
    const storedMetadata = this.getMetadata(request.bucketId, request.decodedObjectId);
    const authorized =
      skipAuth ||
      (await this._rulesValidator.validate(
        ["b", request.bucketId, "o", request.decodedObjectId].join("/"),
        request.bucketId,
        RulesetOperationMethod.DELETE,
        { before: storedMetadata?.asRulesResource() },
        request.authorization
      ));
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
  public async handleUpdateObjectMetadata(
    request: UpdateObjectMetadataRequest,
    skipAuth = false
  ): Promise<StoredFileMetadata> {
    const storedMetadata = this.getMetadata(request.bucketId, request.decodedObjectId);

    const authorized =
      skipAuth ||
      (await this._rulesValidator.validate(
        ["b", request.bucketId, "o", request.decodedObjectId].join("/"),
        request.bucketId,
        RulesetOperationMethod.UPDATE,
        {
          before: storedMetadata?.asRulesResource(),
          after: storedMetadata?.asRulesResource(request.metadata),
        },
        request.authorization
      ));
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
   * object to its permanent location on disk.
   * TODO(tonyjhuang): Inject a Rules evaluator into StorageLayer to avoid needing skipAuth param
   * @throws {ForbiddenError} if the request is not authorized.
   */
  public async handleUploadObject(upload: Upload, skipAuth = false): Promise<StoredFileMetadata> {
    if (upload.status !== UploadStatus.FINISHED) {
      throw new Error(`Unexpected upload status encountered: ${upload.status}.`);
    }

    const filePath = this.path(upload.bucketId, upload.objectId);
    const metadata = new StoredFileMetadata(
      {
        name: upload.objectId,
        bucket: upload.bucketId,
        contentType: upload.metadata.contentType || "application/octet-stream",
        contentDisposition: upload.metadata.contentDisposition,
        contentEncoding: upload.metadata.contentEncoding,
        contentLanguage: upload.metadata.contentLanguage,
        cacheControl: upload.metadata.cacheControl,
        customMetadata: upload.metadata.metadata,
      },
      this._cloudFunctions,
      this._persistence.readBytes(upload.path, upload.size)
    );
    const authorized =
      skipAuth ||
      (await this._rulesValidator.validate(
        ["b", upload.bucketId, "o", upload.objectId].join("/"),
        upload.bucketId,
        RulesetOperationMethod.CREATE,
        { after: metadata?.asRulesResource() },
        upload.authorization
      ));
    if (!authorized) {
      this._persistence.deleteFile(upload.path);
      throw new ForbiddenError();
    }

    // Persist to permanent location on disk.
    this._persistence.deleteFile(filePath, /* failSilently = */ true);
    this._persistence.renameFile(upload.path, filePath);
    this._files.set(filePath, new StoredFile(metadata, this._persistence.getDiskPath(filePath)));
    this._cloudFunctions.dispatch("finalize", new CloudStorageObjectMetadata(metadata));
    return metadata;
  }

  public copyFile(
    sourceFile: StoredFileMetadata,
    destinationBucket: string,
    destinationObject: string,
    incomingMetadata?: IncomingMetadata
  ): StoredFileMetadata {
    const filePath = this.path(destinationBucket, destinationObject);

    this._persistence.deleteFile(filePath, /* failSilently = */ true);

    const bytes = this.getBytes(sourceFile.bucket, sourceFile.name) as Buffer;
    this._persistence.appendBytes(filePath, bytes);

    const newMetadata: IncomingMetadata = {
      ...sourceFile,
      metadata: sourceFile.customMetadata,
      ...incomingMetadata,
    };
    if (
      sourceFile.downloadTokens.length &&
      // Only copy download tokens if we're not overwriting any custom metadata
      !(incomingMetadata?.metadata && Object.keys(incomingMetadata?.metadata).length)
    ) {
      if (!newMetadata.metadata) newMetadata.metadata = {};
      newMetadata.metadata.firebaseStorageDownloadTokens = sourceFile.downloadTokens.join(",");
    }
    if (newMetadata.metadata) {
      // Convert null metadata values to empty strings
      for (const [k, v] of Object.entries(newMetadata.metadata)) {
        if (v === null) newMetadata.metadata[k] = "";
      }
    }

    const copiedFileMetadata = new StoredFileMetadata(
      {
        name: destinationObject,
        bucket: destinationBucket,
        contentType: newMetadata.contentType || "application/octet-stream",
        contentDisposition: newMetadata.contentDisposition,
        contentEncoding: newMetadata.contentEncoding,
        contentLanguage: newMetadata.contentLanguage,
        cacheControl: newMetadata.cacheControl,
        customMetadata: newMetadata.metadata,
      },
      this._cloudFunctions,
      bytes,
      incomingMetadata
    );
    const file = new StoredFile(copiedFileMetadata, this._persistence.getDiskPath(filePath));
    this._files.set(filePath, file);

    this._cloudFunctions.dispatch("finalize", new CloudStorageObjectMetadata(file.metadata));
    return file.metadata;
  }

  /**
   * Lists all files and prefixes (folders) at a path.
   * @throws {ForbiddenError} if the request is not authorized.
   */
  public async handleListObjects(
    request: ListObjectsRequest,
    skipAuth = false
  ): Promise<ListResponse> {
    const authorized =
      skipAuth ||
      (await this._rulesValidator.validate(
        ["b", request.bucketId, "o", request.prefix].join("/"),
        request.bucketId,
        RulesetOperationMethod.LIST,
        {},
        request.authorization
      ));
    if (!authorized) {
      throw new ForbiddenError();
    }
    const itemsResults = this.listItems(
      request.bucketId,
      request.prefix,
      request.delimiter,
      request.pageToken,
      request.maxResults
    );
    return new ListResponse(
      itemsResults.prefixes ?? [],
      itemsResults.items?.map((i) => new ListItem(i.name, i.bucket)) ?? [],
      itemsResults.nextPageToken
    );
  }

  public listItems(
    bucket: string,
    prefix: string,
    delimiter: string,
    pageToken: string | undefined,
    maxResults: number | undefined
  ): {
    prefixes?: string[];
    items?: CloudStorageObjectMetadata[];
    nextPageToken?: string;
  } {
    let items: Array<StoredFileMetadata> = [];
    const prefixes = new Set<string>();
    for (const [, file] of this._files) {
      if (file.metadata.bucket !== bucket) {
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
        // items[] contains object metadata for objects whose names do not contain delimiter, or whose names only have instances of delimiter in their prefix.
        includeMetadata = delimiterIdx === -1 || delimiterAfterPrefixIdx === -1;
        if (delimiterAfterPrefixIdx !== -1) {
          // prefixes[] contains truncated object names for objects whose names contain delimiter after any prefix. Object names are truncated beyond the first applicable instance of the delimiter.
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

    if (!maxResults) {
      maxResults = 1000;
    }

    let nextPageToken = undefined;
    if (items.length > maxResults) {
      nextPageToken = items[maxResults].name;
      items = items.slice(0, maxResults);
    }

    return {
      nextPageToken,
      prefixes: prefixes.size > 0 ? [...prefixes].sort() : undefined,
      items:
        items.length > 0 ? items.map((item) => new CloudStorageObjectMetadata(item)) : undefined,
    };
  }

  /** Creates a new Firebase download token for an object. */
  public handleCreateDownloadToken(request: CreateDownloadTokenRequest): StoredFileMetadata {
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
  public handleDeleteDownloadToken(request: DeleteDownloadTokenRequest): StoredFileMetadata {
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
  async export(storageExportPath: string) {
    // Export a list of all known bucket IDs, which can be used to reconstruct
    // the bucket metadata.
    const bucketsList: BucketsList = {
      buckets: [],
    };
    for (const b of await this.listBuckets()) {
      bucketsList.buckets.push({ id: b.id });
    }
    const bucketsFilePath = path.join(storageExportPath, "buckets.json");
    await fse.writeFile(bucketsFilePath, JSON.stringify(bucketsList, undefined, 2));

    // Recursively copy all file blobs
    const blobsDirPath = path.join(storageExportPath, "blobs");
    await fse.ensureDir(blobsDirPath);
    await fse.copy(this.dirPath, blobsDirPath, { recursive: true });

    // Store a metadata file for each file
    const metadataDirPath = path.join(storageExportPath, "metadata");
    await fse.ensureDir(metadataDirPath);

    for await (const [p, file] of this._files.entries()) {
      const metadataExportPath = path.join(metadataDirPath, encodeURIComponent(p)) + ".json";

      await fse.writeFile(metadataExportPath, StoredFileMetadata.toJSON(file.metadata));
    }
  }

  /**
   * Import can be implemented using sync operations because the emulator should
   * not be handling any other requests during import.
   */
  import(storageExportPath: string) {
    // Restore list of buckets
    const bucketsFile = path.join(storageExportPath, "buckets.json");
    const bucketsList = JSON.parse(readFileSync(bucketsFile, "utf-8")) as BucketsList;
    for (const b of bucketsList.buckets) {
      const bucketMetadata = new CloudStorageBucketMetadata(b.id);
      this._buckets.set(b.id, bucketMetadata);
    }

    const metadataDir = path.join(storageExportPath, "metadata");
    const blobsDir = path.join(storageExportPath, "blobs");

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

      const file = new StoredFile(metadata, blobPath);
      this._files.set(blobPath, file);
    }

    // Recursively copy all blobs
    fse.copySync(blobsDir, this.dirPath);
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
