import { openSync, closeSync, readSync, unlinkSync, renameSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { v4 } from "uuid";
import { ListItem, ListResponse } from "./list";
import {
  CloudStorageBucketMetadata,
  CloudStorageObjectMetadata,
  IncomingMetadata,
  StoredFileMetadata,
} from "./metadata";
import * as path from "path";
import * as fs from "fs";
import * as fse from "fs-extra";
import * as rimraf from "rimraf";
import { StorageCloudFunctions } from "./cloudFunctions";
import { logger } from "../../logger";

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
  private _currentBytesUploaded = 0;
  private _status: UploadStatus = UploadStatus.ACTIVE;
  private _fileLocation: string;

  constructor(
    bucketId: string,
    objectId: string,
    uploadId: string,
    contentType: string,
    metadata: IncomingMetadata
  ) {
    this._bucketId = bucketId;
    this._objectId = objectId;
    this._uploadId = uploadId;
    this._contentType = contentType;
    this._metadata = metadata;
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

export type FinalizedUpload = {
  upload: ResumableUpload;
  file: StoredFile;
};

export class StorageLayer {
  private _files!: Map<string, StoredFile>;
  private _uploads!: Map<string, ResumableUpload>;
  private _buckets!: Map<string, CloudStorageBucketMetadata>;
  private _persistence!: Persistence;
  private _cloudFunctions: StorageCloudFunctions;

  constructor(private _projectId: string) {
    this.reset();
    this._cloudFunctions = new StorageCloudFunctions(this._projectId);
  }

  public reset(): void {
    this._files = new Map();
    this._persistence = new Persistence(`${tmpdir()}/firebase/storage/blobs`);
    this._uploads = new Map();
    this._buckets = new Map();
  }

  createBucket(id: string): void {
    if (!this._buckets.has(id)) {
      this._buckets.set(id, new CloudStorageBucketMetadata(id));
    }
  }

  listBuckets(): CloudStorageBucketMetadata[] {
    if (this._buckets.size == 0) {
      this.createBucket("default-bucket");
    }

    return [...this._buckets.values()];
  }

  public getMetadata(bucket: string, object: string): StoredFileMetadata | undefined {
    const key = this.path(bucket, object);
    const val = this._files.get(key);

    if (val) {
      return val.metadata;
    }

    return;
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

  public startUpload(
    bucket: string,
    object: string,
    contentType: string,
    metadata: IncomingMetadata
  ): ResumableUpload {
    const uploadId = v4();
    const upload = new ResumableUpload(bucket, object, uploadId, contentType, metadata);
    this._uploads.set(uploadId, upload);
    return upload;
  }

  public queryUpload(uploadId: string): ResumableUpload | undefined {
    return this._uploads.get(uploadId);
  }

  public cancelUpload(uploadId: string): ResumableUpload | undefined {
    const upload = this._uploads.get(uploadId);
    if (!upload) {
      return undefined;
    }
    upload.status = UploadStatus.CANCELLED;
    this._persistence.deleteFile(upload.fileLocation);
  }

  public uploadBytes(uploadId: string, bytes: Buffer): ResumableUpload | undefined {
    const upload = this._uploads.get(uploadId);

    if (!upload) {
      return undefined;
    }
    this._persistence.appendBytes(upload.fileLocation, bytes, upload.currentBytesUploaded);
    upload.currentBytesUploaded += bytes.byteLength;
    return upload;
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

    if (file == undefined) {
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

  public finalizeUpload(uploadId: string): FinalizedUpload | undefined {
    const upload = this._uploads.get(uploadId);

    if (!upload) {
      return undefined;
    }

    upload.status = UploadStatus.FINISHED;
    const filePath = this.path(upload.bucketId, upload.objectId);

    const bytes = this._persistence.readBytes(upload.fileLocation, upload.currentBytesUploaded);
    const finalMetadata = new StoredFileMetadata(
      {
        name: upload.objectId,
        bucket: upload.bucketId,
        contentType: "",
        contentEncoding: upload.metadata.contentEncoding,
        customMetadata: upload.metadata.metadata,
      },
      this._cloudFunctions,
      bytes,
      upload.metadata
    );
    const file = new StoredFile(finalMetadata, filePath);
    this._files.set(filePath, file);
    this._persistence.renameFile(upload.fileLocation, filePath);

    this._cloudFunctions.dispatch("finalize", new CloudStorageObjectMetadata(file.metadata));
    return { upload: upload, file: file };
  }

  public oneShotUpload(
    bucket: string,
    object: string,
    contentType: string,
    incomingMetadata: IncomingMetadata,
    bytes: Buffer
  ) {
    const filePath = this.path(bucket, object);
    this._persistence.appendBytes(filePath, bytes);
    const md = new StoredFileMetadata(
      {
        name: object,
        bucket: bucket,
        contentType: "",
        contentEncoding: incomingMetadata.contentEncoding,
        customMetadata: incomingMetadata.metadata,
      },
      this._cloudFunctions,
      bytes,
      incomingMetadata
    );
    const file = new StoredFile(md, this._persistence.getDiskPath(filePath));
    this._files.set(filePath, file);

    this._cloudFunctions.dispatch("finalize", new CloudStorageObjectMetadata(file.metadata));
    return file.metadata;
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
      if (file.metadata.bucket != bucket) {
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
      if (startAtIndex == -1) {
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
      const idx = items.findIndex((v) => v == pageToken);
      if (idx != -1) {
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
      if (file.metadata.bucket != bucket) {
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
      const idx = items.findIndex((v) => v == pageToken);
      if (idx != -1) {
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
    for (const b of this.listBuckets()) {
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

export class Persistence {
  private _dirPath: string;
  constructor(dirPath: string) {
    this._dirPath = dirPath;
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, {
        recursive: true,
      });
    }
  }

  public get dirPath(): string {
    return this._dirPath;
  }

  appendBytes(fileName: string, bytes: Buffer, fileOffset?: number): string {
    const path = this.getDiskPath(fileName);
    const dirPath = path.substring(0, path.lastIndexOf("/"));

    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, {
        recursive: true,
      });
    }
    let fd;

    try {
      // TODO: This is more technically correct, but corrupts multipart files
      // fd = openSync(path, "w+");
      // writeSync(fd, bytes, 0, bytes.byteLength, fileOffset);

      fs.appendFileSync(path, bytes);
      return path;
    } finally {
      if (fd) {
        closeSync(fd);
      }
    }
  }

  readBytes(fileName: string, size: number, fileOffset?: number): Buffer {
    const path = this.getDiskPath(fileName);
    let fd;
    try {
      fd = openSync(path, "r");
      const buf = Buffer.alloc(size);
      const offset = fileOffset && fileOffset > 0 ? fileOffset : 0;
      readSync(fd, buf, 0, size, offset);
      return buf;
    } finally {
      if (fd) {
        closeSync(fd);
      }
    }
  }

  deleteFile(fileName: string): void {
    unlinkSync(this.getDiskPath(fileName));
  }

  deleteAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      rimraf(this._dirPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  renameFile(oldName: string, newName: string): void {
    const dirPath = this.getDiskPath(path.dirname(newName));

    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, {
        recursive: true,
      });
    }

    renameSync(this.getDiskPath(oldName), this.getDiskPath(newName));
  }

  getDiskPath(fileName: string): string {
    return path.join(this._dirPath, fileName);
  }
}
