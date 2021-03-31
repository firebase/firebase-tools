import * as uuid from "uuid";
import * as crypto from "crypto";
import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";
import { StorageCloudFunctions } from "./cloudFunctions";
import { crc32c } from "./crc";

type RulesResourceMetadataOverrides = {
  [Property in keyof RulesResourceMetadata]?: RulesResourceMetadata[Property];
};

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
  contentLanguage: string;
  cacheControl: string;
  crc32c: string;
  etag: string;
  downloadTokens: string;
  customMetadata: { [s: string]: string };

  constructor(
    bucketId: string,
    objectId: string,
    bytes: Buffer,
    contentType: string,
    contentEncoding: string | undefined,
    incomingMetadata: IncomingMetadata,
    private _cloudFunctions: StorageCloudFunctions
  ) {
    this.name = objectId;
    this.bucket = bucketId;
    this.timeCreated = new Date();
    this.size = bytes.byteLength;
    this.metageneration = 1;
    this.generation = Date.now();
    this.md5Hash = generateMd5Hash(bytes);
    this.storageClass = "STANDARD";
    this.downloadTokens = "";
    this.etag = "someETag";
    this.crc32c = `${crc32c(bytes)}`;
    this.contentDisposition = "inline";
    this.updated = this.timeCreated;
    this.contentType = contentType;
    this.cacheControl = "no-cache";
    this.contentLanguage = "en-us";
    this.contentEncoding = contentEncoding || "identity";
    this.customMetadata = incomingMetadata.metadata || {};

    this.addDownloadToken();
    this.update(incomingMetadata);
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
      metadata: this.customMetadata,
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

  update(incoming: IncomingMetadata): void {
    if (incoming.contentDisposition) {
      this.contentDisposition = incoming.contentDisposition;
    }

    if (incoming.contentType) {
      this.contentType = incoming.contentType;
    }

    if (incoming.metadata) {
      this.customMetadata = incoming.metadata;
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

    this._cloudFunctions.dispatch("metadataUpdate", new CloudStorageObjectMetadata(this));
  }

  addDownloadToken(): void {
    if (!this.downloadTokens || this.downloadTokens === "") {
      this.downloadTokens = uuid.v4();
      return;
    }
    const tokens = this.downloadTokens.split(",");
    this.downloadTokens = [...tokens, uuid.v4()].join(",");
    this.update({});
  }

  deleteDownloadToken(token: string): void {
    if (!this.downloadTokens || this.downloadTokens === "") {
      return;
    }
    const tokens = this.downloadTokens.split(",");
    const remainingTokens = tokens.filter((t) => t != token);
    this.downloadTokens = remainingTokens.join(",");
    if (remainingTokens.length == 0) {
      // if empty after deleting, always add a new token.
      this.addDownloadToken();
    }
    this.update({});
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
  crc32c: string;
  etag: string;
  downloadTokens: string;
  metadata: object | undefined;

  constructor(md: StoredFileMetadata) {
    this.name = md.name;
    this.bucket = md.bucket;
    this.generation = md.generation.toString();
    this.metageneration = md.metageneration.toString();
    this.contentType = md.contentType;
    this.timeCreated = toSerializedDate(md.timeCreated);
    this.updated = toSerializedDate(md.updated);
    this.storageClass = md.storageClass;
    this.size = md.size.toString();
    this.md5Hash = md.md5Hash;
    this.crc32c = md.crc32c;
    this.etag = md.etag;
    this.downloadTokens = md.downloadTokens;
    this.contentEncoding = md.contentEncoding;
    this.contentDisposition = md.contentDisposition;
    this.metadata = md.customMetadata;
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
  metadata: { [s: string]: string };
  id: string;
  timeStorageClassUpdated: string;
  selfLink: string;
  mediaLink: string;

  constructor(md: StoredFileMetadata) {
    this.name = md.name;
    this.bucket = md.bucket;
    this.generation = md.generation.toString();
    this.metageneration = md.metageneration.toString();
    this.contentType = md.contentType;
    this.timeCreated = toSerializedDate(md.timeCreated);
    this.updated = toSerializedDate(md.updated);
    this.storageClass = md.storageClass;
    this.size = md.size.toString();
    this.md5Hash = md.md5Hash;
    this.etag = md.etag;
    this.metadata = {
      firebaseStorageDownloadTokens: md.downloadTokens,
      ...md.customMetadata,
    };

    // I'm not sure why but @google-cloud/storage calls .substr(4) on this value, so we need to pad it.
    this.crc32c = "----" + Buffer.from([md.crc32c]).toString("base64");

    this.timeStorageClassUpdated = toSerializedDate(md.timeCreated);
    this.id = `${md.bucket}/${md.name}/${md.generation}`;
    this.selfLink = `http://${EmulatorRegistry.getInfo(Emulators.STORAGE)?.host}:${
      EmulatorRegistry.getInfo(Emulators.STORAGE)?.port
    }/storage/v1/b/${md.bucket}/o/${encodeURIComponent(md.name)}`;
    this.mediaLink = `http://${EmulatorRegistry.getInfo(Emulators.STORAGE)?.host}:${
      EmulatorRegistry.getInfo(Emulators.STORAGE)?.port
    }/download/storage/v1/b/${md.bucket}/o/${encodeURIComponent(md.name)}?generation=${
      md.generation
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
  const day = `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  const time = `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d
    .getSeconds()
    .toString()
    .padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
  return `${day}T${time}Z`;
}

function generateMd5Hash(bytes: Buffer): string {
  const hash = crypto.createHash("md5");
  hash.update(bytes);
  return hash.digest("hex");
}
