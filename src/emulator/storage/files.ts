import { ListItem, ListResponse } from "./list";
import {
  CloudStorageBucketMetadata,
  CloudStorageObjectMetadata,
  IncomingMetadata,
  StoredFileMetadata,
} from "./metadata";
import { NotFoundError, ForbiddenError } from "./errors";
import * as path from "path";
import * as fs from "fs";
import * as fse from "fs-extra";
import { StorageCloudFunctions } from "./cloudFunctions";
import { logger } from "../../logger";
import {
  constructDefaultAdminSdkConfig,
  getProjectAdminSdkConfigOrCached,
} from "../adminSdkConfig";
import { RulesetOperationMethod } from "./rules/types";
import { RulesValidator } from "./rules/utils";
import { Persistence } from "./persistence";
import { Upload } from "./upload";

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

export class ResumableUpload {
  private _uploadId: string;
  private _metadata: IncomingMetadata;
  private _bucketId: string;
  private _objectId: string;
  private _contentType: string;
  private _authorization: string | undefined;
  private _currentBytesUploaded = 0;
  private _status: UploadStatus = UploadStatus.ACTIVE;
  private _fileLocation: string;

  constructor(
    bucketId: string,
    objectId: string,
    uploadId: string,
    contentType: string,
    metadata: IncomingMetadata,
    authorization?: string
  ) {
    this._bucketId = bucketId;
    this._objectId = objectId;
    this._uploadId = uploadId;
    this._contentType = contentType;
    this._metadata = metadata;
    this._authorization = authorization;
    this._fileLocation = encodeURIComponent(`${uploadId}_b_${bucketId}_o_${objectId}`);
    this._currentBytesUploaded = 0;
  }

  public get uploadId(): string {
    return this._uploadId;
  }
  public get metadata(): IncomingMetadata {
    return this._metadata;
  }
  public get bucketId(): string {
    return this._bucketId;
  }
  public get objectId(): string {
    return this._objectId;
  }
  public get contentType(): string {
    return this._contentType;
  }
  public set contentType(contentType: string) {
    this._contentType = contentType;
  }
  public get authorization(): string | undefined {
    return this._authorization;
  }
  public get currentBytesUploaded(): number {
    return this._currentBytesUploaded;
  }
  public set currentBytesUploaded(value: number) {
    this._currentBytesUploaded = value;
  }
  public set status(status: UploadStatus) {
    this._status = status;
  }
  public get status(): UploadStatus {
    return this._status;
  }
  public get fileLocation(): string {
    return this._fileLocation;
  }
}

export enum UploadStatus {
  ACTIVE,
  CANCELLED,
  FINISHED,
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

export class StorageLayer {
  private _files!: Map<string, StoredFile>;
  private _buckets!: Map<string, CloudStorageBucketMetadata>;
  private _cloudFunctions: StorageCloudFunctions;

  constructor(
    private _projectId: string,
    private _validator: RulesValidator,
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
  public async handleGetObject(request: GetObjectRequest): Promise<GetObjectResponse> {
    const metadata = this.getMetadata(request.bucketId, request.decodedObjectId);

    // If a valid download token is present, skip Firebase Rules auth. Mainly used by the js sdk.
    let authorized = (metadata?.downloadTokens || []).includes(request.downloadToken ?? "");
    if (!authorized) {
      authorized = await this._validator.validate(
        ["b", request.bucketId, "o", request.decodedObjectId].join("/"),
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

  /**
   * Generates metadata for an uploaded file. Generally, this should only be used for finalized
   * uploads, unless needed for security rule checks.
   * @param upload The upload corresponding to the file for which to generate metadata.
   * @returns Metadata for uploaded file.
   */
  public createMetadata(upload: ResumableUpload): StoredFileMetadata {
    const bytes = this._persistence.readBytes(upload.fileLocation, upload.currentBytesUploaded);
    return new StoredFileMetadata(
      {
        name: upload.objectId,
        bucket: upload.bucketId,
        contentType: "",
        contentEncoding: upload.metadata.contentEncoding,
        customMetadata: upload.metadata.metadata,
      },
      this._cloudFunctions,
      bytes
    );
  }

  public getBytes(
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

  public(value: Map<string, StoredFile>) {
    this._files = value;
  }

  public deleteFile(bucketId: string, objectId: string): boolean {
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

  public async deleteAll(): Promise<void> {
    return this._persistence.deleteAll();
  }

  /**
   * Last step in uploading a file. Validates the request and persists the staging
   * object to its permanent location on disk.
   * TODO(tonyjhuang): Inject a Rules evaluator into StorageLayer to avoid needing skipAuth param
   * @throws {ForbiddenError} if the request fails security rules auth.
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
        contentEncoding: upload.metadata.contentEncoding,
        customMetadata: upload.metadata.metadata,
      },
      this._cloudFunctions,
      this._persistence.readBytes(upload.path, upload.size)
    );
    const authorized =
      skipAuth ||
      (await this._validator.validate(
        ["b", upload.bucketId, "o", upload.objectId].join("/"),
        RulesetOperationMethod.CREATE,
        { before: metadata?.asRulesResource() },
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

  public listItemsAndPrefixes(
    bucket: string,
    prefix: string,
    delimiter: string,
    pageToken: string | undefined,
    maxResults: number | undefined
  ): ListResponse {
    if (!delimiter) {
      delimiter = "/";
    }

    if (!prefix) {
      prefix = "";
    }

    if (!prefix.endsWith(delimiter)) {
      prefix += delimiter;
    }

    if (!prefix.startsWith(delimiter)) {
      prefix = delimiter + prefix;
    }

    let items = [];
    const prefixes = new Set<string>();
    for (const [, file] of this._files) {
      if (file.metadata.bucket !== bucket) {
        continue;
      }

      let name = `${delimiter}${file.metadata.name}`;
      if (!name.startsWith(prefix)) {
        continue;
      }

      name = name.substring(prefix.length);
      if (name.startsWith(delimiter)) {
        name = name.substring(prefix.length);
      }

      const startAtIndex = name.indexOf(delimiter);
      if (startAtIndex === -1) {
        if (!file.metadata.name.endsWith("/")) {
          items.push(file.metadata.name);
        }
      } else {
        const prefixPath = prefix + name.substring(0, startAtIndex + 1);
        prefixes.add(prefixPath);
      }
    }

    items.sort();
    if (pageToken) {
      const idx = items.findIndex((v) => v === pageToken);
      if (idx !== -1) {
        items = items.slice(idx);
      }
    }

    if (!maxResults) {
      maxResults = 1000;
    }

    let nextPageToken = undefined;
    if (items.length > maxResults) {
      nextPageToken = items[maxResults];
      items = items.slice(0, maxResults);
    }

    return new ListResponse(
      [...prefixes].sort(),
      items.map((i) => new ListItem(i, bucket)),
      nextPageToken
    );
  }

  public listItems(
    bucket: string,
    prefix: string,
    delimiter: string,
    pageToken: string | undefined,
    maxResults: number | undefined
  ) {
    if (!delimiter) {
      delimiter = "/";
    }

    if (!prefix) {
      prefix = "";
    }

    if (!prefix.endsWith(delimiter)) {
      prefix += delimiter;
    }

    let items = [];
    for (const [, file] of this._files) {
      if (file.metadata.bucket !== bucket) {
        continue;
      }

      let name = file.metadata.name;
      if (!name.startsWith(prefix)) {
        continue;
      }

      name = name.substring(prefix.length);
      if (name.startsWith(delimiter)) {
        name = name.substring(prefix.length);
      }

      items.push(this.path(file.metadata.bucket, file.metadata.name));
    }

    items.sort();
    if (pageToken) {
      const idx = items.findIndex((v) => v === pageToken);
      if (idx !== -1) {
        items = items.slice(idx);
      }
    }

    if (!maxResults) {
      maxResults = 1000;
    }

    return {
      kind: "#storage/objects",
      items: items.map((item) => {
        const storedFile = this._files.get(item);
        if (!storedFile) {
          return console.warn(`No file ${item}`);
        }

        return new CloudStorageObjectMetadata(storedFile.metadata);
      }),
    };
  }

  public addDownloadToken(bucket: string, object: string): StoredFileMetadata | undefined {
    const key = this.path(bucket, object);
    const val = this._files.get(key);
    if (!val) {
      return undefined;
    }
    const md = val.metadata;
    md.addDownloadToken();
    return md;
  }

  public deleteDownloadToken(
    bucket: string,
    object: string,
    token: string
  ): StoredFileMetadata | undefined {
    const key = this.path(bucket, object);
    const val = this._files.get(key);
    if (!val) {
      return undefined;
    }
    const md = val.metadata;
    md.deleteDownloadToken(token);
    return md;
  }

  private path(bucket: string, object: string): string {
    const directory = path.dirname(object);
    const filename = path.basename(object) + (object.endsWith("/") ? "/" : "");

    return path.join(bucket, directory, encodeURIComponent(filename));
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
      const metadataExportPath = path.join(metadataDirPath, p) + ".json";
      const metadataExportDirPath = path.dirname(metadataExportPath);

      await fse.ensureDir(metadataExportDirPath);
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
    const bucketsList = JSON.parse(fs.readFileSync(bucketsFile, "utf-8")) as BucketsList;
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
      const metadata = StoredFileMetadata.fromJSON(
        fs.readFileSync(f, "utf-8"),
        this._cloudFunctions
      );

      // To get the blob path from the metadata path:
      // 1) Get the relative path to the metadata export dir
      // 2) Subtract .json from the end
      const metadataRelPath = path.relative(metadataDir, f);
      const blobPath = metadataRelPath.substring(0, metadataRelPath.length - dotJson.length);

      const blobAbsPath = path.join(blobsDir, blobPath);
      if (!fs.existsSync(blobAbsPath)) {
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
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const p = path.join(dir, file);
      if (fs.statSync(p).isDirectory()) {
        yield* this.walkDirSync(p);
      } else {
        yield p;
      }
    }
  }
}
