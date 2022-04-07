import * as uuid from "uuid";
import * as crypto from "crypto";
import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";
import { StorageCloudFunctions } from "./cloudFunctions";
import { crc32c, crc32cToString } from "./crc";

type RulesResourceMetadataOverrides = {
  [Property in keyof RulesResourceMetadata]?: RulesResourceMetadata[Property];
};

type SerializedFileMetadata = Omit<StoredFileMetadata, "timeCreated" | "updated"> & {
  timeCreated: string;
  updated: string;
};

/**
 * Note: all fields of this object which do not begin with _ are serialized
 * during export, so add/remove/modify fields with caution.
 */
export class StoredFileMetadata {
  name: string;
  bucket: string;
  generation: number;
  metageneration: number;
  contentType: string;
  timeCreated: Date;
  updated: Date;
  storageClass: string;
  size: number;
  md5Hash: string;
  contentEncoding: string;
  contentDisposition: string;
  contentLanguage?: string;
  cacheControl: string;
  customTime?: Date;
  crc32c: string;
  etag: string;
  downloadTokens: string[];
  customMetadata?: { [s: string]: string };

  constructor(
    opts: Partial<SerializedFileMetadata> & {
      name: string;
      bucket: string;
      contentType: string;
    },
    private _cloudFunctions: StorageCloudFunctions,
    bytes?: Buffer,
    incomingMetadata?: IncomingMetadata
  ) {
    // Required fields
    this.name = opts.name;
    this.bucket = opts.bucket;
    this.contentType = opts.contentType;

    // Optional fields
    this.metageneration = opts.metageneration || 1;
    this.generation = opts.generation || Date.now();
    this.storageClass = opts.storageClass || "STANDARD";
    this.contentDisposition = opts.contentDisposition || "inline";
    // Use same default value GCS uses (see https://cloud.google.com/storage/docs/metadata#caching_data)
    this.cacheControl = opts.cacheControl || "public, max-age=3600";
    this.contentLanguage = opts.contentLanguage;
    this.customTime = opts.customTime;
    this.contentEncoding = opts.contentEncoding || "identity";
    this.customMetadata = opts.customMetadata;
    this.downloadTokens = opts.downloadTokens || [];
    if (opts.etag) {
      this.etag = opts.etag;
    } else {
      this.etag = generateETag(this.generation, this.metageneration);
    }

    // Special handling for date fields
    this.timeCreated = opts.timeCreated ? new Date(opts.timeCreated) : new Date();
    this.updated = opts.updated ? new Date(opts.updated) : this.timeCreated;

    // Fields derived from bytes
    if (bytes) {
      this.size = bytes.byteLength;
      this.md5Hash = generateMd5Hash(bytes);
      this.crc32c = `${crc32c(bytes)}`;
    } else if (opts.size !== undefined && opts.md5Hash && opts.crc32c) {
      this.size = opts.size;
      this.md5Hash = opts.md5Hash;
      this.crc32c = opts.crc32c;
    } else {
      throw new Error("Must pass bytes array or opts object with size, md5hash, and crc32c");
    }

    if (incomingMetadata) {
      this.update(incomingMetadata, /* shouldTrigger = */ false);
    }

    this.deleteFieldsSetAsNull();
    this.setDownloadTokensFromCustomMetadata();
  }

  asRulesResource(proposedChanges?: RulesResourceMetadataOverrides): RulesResourceMetadata {
    let rulesResource: RulesResourceMetadata = {
      name: this.name,
      bucket: this.bucket,
      generation: this.generation,
      metageneration: this.metageneration,
      size: this.size,
      timeCreated: this.timeCreated,
      updated: this.updated,
      md5Hash: this.md5Hash,
      crc32c: this.crc32c,
      etag: this.etag,
      contentDisposition: this.contentDisposition,
      contentEncoding: this.contentEncoding,
      contentType: this.contentType,
      metadata: this.customMetadata || {},
    };

    if (proposedChanges) {
      if (proposedChanges.md5Hash !== rulesResource.md5Hash) {
        // Step the generation forward and reset values
        rulesResource.generation = Date.now();
        rulesResource.metageneration = 1;
        rulesResource.timeCreated = new Date();
        rulesResource.updated = rulesResource.timeCreated;
      } else {
        // Otherwise this was just a metadata change
        rulesResource.metageneration++;
      }

      rulesResource = {
        ...rulesResource,
        ...proposedChanges,
      };
    }

    return rulesResource;
  }

  private setDownloadTokensFromCustomMetadata() {
    if (!this.customMetadata) {
      return;
    }

    if (this.customMetadata.firebaseStorageDownloadTokens) {
      this.downloadTokens = [
        ...new Set([
          ...this.downloadTokens,
          ...this.customMetadata.firebaseStorageDownloadTokens.split(","),
        ]),
      ];
      delete this.customMetadata.firebaseStorageDownloadTokens;
    }
  }

  private deleteFieldsSetAsNull() {
    const deletableFields: (keyof this)[] = [
      "contentDisposition",
      "contentType",
      "contentLanguage",
      "contentEncoding",
      "cacheControl",
    ];

    deletableFields.map((field: keyof this) => {
      if (this[field] === null) {
        delete this[field];
      }
    });

    if (this.customMetadata) {
      Object.keys(this.customMetadata).map((key: string) => {
        if (!this.customMetadata) return;
        if (this.customMetadata[key] === null) {
          delete this.customMetadata[key];
        }
      });
    }
  }

  /**
   * TODO(abhisun): Move all cloud function triggers to the storage layer to
   * avoid needing the shouldTrigger field
   */
  update(incoming: IncomingMetadata, shouldTrigger = true): void {
    if (incoming.contentDisposition) {
      this.contentDisposition = incoming.contentDisposition;
    }

    if (incoming.contentType) {
      this.contentType = incoming.contentType;
    }

    if (incoming.metadata) {
      // Convert all values to strings
      this.customMetadata = this.customMetadata ? { ...this.customMetadata } : {};
      for (const [k, v] of Object.entries(incoming.metadata)) {
        this.customMetadata[k] = v === null ? (null as unknown as string) : String(v);
      }
    }

    if (incoming.contentLanguage) {
      this.contentLanguage = incoming.contentLanguage;
    }

    if (incoming.contentEncoding) {
      this.contentEncoding = incoming.contentEncoding;
    }

    if (this.generation) {
      this.generation++;
    }

    this.updated = new Date();

    if (incoming.cacheControl) {
      this.cacheControl = incoming.cacheControl;
    }

    this.setDownloadTokensFromCustomMetadata();
    this.deleteFieldsSetAsNull();

    if (shouldTrigger) {
      this._cloudFunctions.dispatch("metadataUpdate", new CloudStorageObjectMetadata(this));
    }
  }

  addDownloadToken(shouldTrigger = true): void {
    if (!this.downloadTokens.length) {
      this.downloadTokens.push(uuid.v4());
      return;
    }

    this.downloadTokens = [...this.downloadTokens, uuid.v4()];
    this.update({}, shouldTrigger);
  }

  deleteDownloadToken(token: string): void {
    if (!this.downloadTokens.length) {
      return;
    }

    const remainingTokens = this.downloadTokens.filter((t) => t !== token);
    this.downloadTokens = remainingTokens;
    if (remainingTokens.length === 0) {
      // if empty after deleting, always add a new token.
      // shouldTrigger is false as it's taken care of in the subsequent update
      this.addDownloadToken(/* shouldTrigger = */ false);
    }
    this.update({});
  }

  static fromJSON(data: string, cloudFunctions: StorageCloudFunctions): StoredFileMetadata {
    const opts = JSON.parse(data) as SerializedFileMetadata;
    return new StoredFileMetadata(opts, cloudFunctions);
  }

  public static toJSON(metadata: StoredFileMetadata): string {
    return JSON.stringify(
      metadata,
      (key, value) => {
        if (key.startsWith("_")) {
          return undefined;
        }

        return value;
      },
      2
    );
  }
}

export interface RulesResourceMetadata {
  name: string;
  bucket: string;
  generation: number;
  metageneration: number;
  size: number;
  timeCreated: Date;
  updated: Date;
  md5Hash: string;
  crc32c: string;
  etag: string;
  contentDisposition: string;
  contentEncoding: string;
  contentType: string;
  metadata: { [s: string]: string };
}

export interface IncomingMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata?: { [s: string]: string };
}

export class OutgoingFirebaseMetadata {
  name: string;
  bucket: string;
  generation: string;
  metageneration: string;
  contentType: string;
  timeCreated: string;
  updated: string;
  storageClass: string;
  size: string;
  md5Hash: string;
  contentEncoding: string;
  contentDisposition: string;
  contentLanguage?: string;
  cacheControl?: string;
  crc32c: string;
  etag: string;
  downloadTokens: string;
  metadata: object | undefined;

  constructor(metadata: StoredFileMetadata) {
    this.name = metadata.name;
    this.bucket = metadata.bucket;
    this.generation = metadata.generation.toString();
    this.metageneration = metadata.metageneration.toString();
    this.contentType = metadata.contentType;
    this.timeCreated = toSerializedDate(metadata.timeCreated);
    this.updated = toSerializedDate(metadata.updated);
    this.storageClass = metadata.storageClass;
    this.size = metadata.size.toString();
    this.md5Hash = metadata.md5Hash;
    this.crc32c = metadata.crc32c;
    this.etag = metadata.etag;
    this.downloadTokens = metadata.downloadTokens.join(",");
    this.contentEncoding = metadata.contentEncoding;
    this.contentDisposition = metadata.contentDisposition;
    this.metadata = metadata.customMetadata;
    this.contentLanguage = metadata.contentLanguage;
    this.cacheControl = metadata.cacheControl;
  }
}

export class CloudStorageBucketMetadata {
  kind = "#storage/bucket";
  selfLink: string;
  id: string;
  name: string;
  projectNumber: string;
  metageneration: string;
  location: string;
  storageClass: string;
  etag: string;
  timeCreated: string;
  updated: string;
  locationType: string;

  constructor(id: string) {
    this.name = id;
    this.id = id;
    this.selfLink = `http://${EmulatorRegistry.getInfo(Emulators.STORAGE)?.host}:${
      EmulatorRegistry.getInfo(Emulators.STORAGE)?.port
    }/v1/b/${this.id}`;
    this.timeCreated = toSerializedDate(new Date());
    this.updated = this.timeCreated;
    this.projectNumber = "000000000000";
    this.metageneration = "1";
    this.location = "US";
    this.storageClass = "STANDARD";
    this.etag = "====";
    this.locationType = "mutli-region";
  }
}

export class CloudStorageObjectAccessControlMetadata {
  kind = "storage#objectAccessControl";

  constructor(
    public object: string,
    public generation: string,
    public selfLink: string,
    public id: string,
    public role: string,
    public entity: string,
    public bucket: string,
    public etag: string
  ) {}
}

export class CloudStorageObjectMetadata {
  kind = "#storage#object";
  name: string;
  bucket: string;
  generation: string;
  metageneration: string;
  contentType: string;
  timeCreated: string;
  updated: string;
  storageClass: string;
  size: string;
  md5Hash: string;
  crc32c: string;
  etag: string;
  metadata?: { [s: string]: string };
  contentLanguage?: string;
  contentDisposition: string;
  cacheControl?: string;
  contentEncoding?: string;
  customTime?: string;
  id: string;
  timeStorageClassUpdated: string;
  selfLink: string;
  mediaLink: string;

  constructor(metadata: StoredFileMetadata) {
    this.name = metadata.name;
    this.bucket = metadata.bucket;
    this.generation = metadata.generation.toString();
    this.metageneration = metadata.metageneration.toString();
    this.contentType = metadata.contentType;
    this.contentDisposition = metadata.contentDisposition;
    this.timeCreated = toSerializedDate(metadata.timeCreated);
    this.updated = toSerializedDate(metadata.updated);
    this.storageClass = metadata.storageClass;
    this.size = metadata.size.toString();
    this.md5Hash = metadata.md5Hash;
    this.etag = metadata.etag;
    this.metadata = {};

    if (Object.keys(metadata.customMetadata || {})) {
      this.metadata = {
        ...this.metadata,
        ...metadata.customMetadata,
      };
    }

    if (metadata.downloadTokens.length) {
      this.metadata = {
        ...this.metadata,
        firebaseStorageDownloadTokens: metadata.downloadTokens.join(","),
      };
    }

    if (!Object.keys(this.metadata).length) {
      delete this.metadata;
    }

    if (metadata.contentLanguage) {
      this.contentLanguage = metadata.contentLanguage;
    }

    if (metadata.cacheControl) {
      this.cacheControl = metadata.cacheControl;
    }

    if (metadata.contentDisposition) {
      this.contentDisposition = metadata.contentDisposition;
    }

    if (metadata.contentEncoding) {
      this.contentEncoding = metadata.contentEncoding;
    }

    if (metadata.customTime) {
      this.customTime = toSerializedDate(metadata.customTime);
    }

    this.crc32c = crc32cToString(metadata.crc32c);

    this.timeStorageClassUpdated = toSerializedDate(metadata.timeCreated);
    this.id = `${metadata.bucket}/${metadata.name}/${metadata.generation}`;
    this.selfLink = `http://${EmulatorRegistry.getInfo(Emulators.STORAGE)?.host}:${
      EmulatorRegistry.getInfo(Emulators.STORAGE)?.port
    }/storage/v1/b/${metadata.bucket}/o/${encodeURIComponent(metadata.name)}`;
    this.mediaLink = `http://${EmulatorRegistry.getInfo(Emulators.STORAGE)?.host}:${
      EmulatorRegistry.getInfo(Emulators.STORAGE)?.port
    }/download/storage/v1/b/${metadata.bucket}/o/${encodeURIComponent(metadata.name)}?generation=${
      metadata.generation
    }&alt=media`;
  }
}

/**
 * Returns the given date formatted as `YYYY-mm-ddTHH:mm:ss.fffZ`.
 * for example: 2020-09-18T00:31:33.328Z
 * @param d the date to format.
 * @return the formatted date.
 */
export function toSerializedDate(d: Date): string {
  const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
    .getDate()
    .toString()
    .padStart(2, "0")}`;
  const time = `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d
    .getMilliseconds()
    .toString()
    .padStart(3, "0")}`;
  return `${day}T${time}Z`;
}

function generateMd5Hash(bytes: Buffer): string {
  const hash = crypto.createHash("md5");
  hash.update(bytes);
  return hash.digest("base64");
}

function generateETag(generation: number, metadatageneration: number): string {
  const hash = crypto.createHash("sha1");
  hash.update(`${generation}/${metadatageneration}`);
  // Trim padding
  return hash.digest("base64").slice(0, -1);
}
