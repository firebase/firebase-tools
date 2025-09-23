import * as uuid from "uuid";

import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";
import { EmulatorLogger } from "../emulatorLogger";
import { CloudStorageObjectMetadata, toSerializedDate } from "./metadata";
import { Client } from "../../apiv2";
import { StorageObjectData } from "@google/events/cloud/storage/v1/StorageObjectData";
import { CloudEvent } from "../events/types";

type StorageCloudFunctionAction = "finalize" | "metadataUpdate" | "delete" | "archive";
const STORAGE_V2_ACTION_MAP: Record<StorageCloudFunctionAction, string> = {
  finalize: "finalized",
  metadataUpdate: "metadataUpdated",
  delete: "deleted",
  archive: "archived",
};

export class StorageCloudFunctions {
  private logger = EmulatorLogger.forEmulator(Emulators.STORAGE);
  private multicastPath = "";
  private enabled = false;
  private client?: Client;

  constructor(private projectId: string) {
    if (EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
      this.enabled = true;
      this.multicastPath = `/functions/projects/${projectId}/trigger_multicast`;
      this.client = EmulatorRegistry.client(Emulators.FUNCTIONS);
    }
  }

  public async dispatch(
    action: StorageCloudFunctionAction,
    object: CloudStorageObjectMetadata,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const errStatus: Array<number> = [];
    let err: Error | undefined;
    try {
      /** Legacy Google Events */
      const eventBody = this.createLegacyEventRequestBody(action, object);
      const eventRes = await this.client!.post(this.multicastPath, eventBody);
      if (eventRes.status !== 200) {
        errStatus.push(eventRes.status);
      }
      /** Modern CloudEvents */
      const cloudEventBody = this.createCloudEventRequestBody(action, object);
      const cloudEventRes = await this.client!.post<CloudEvent<StorageObjectData>, any>(
        this.multicastPath,
        cloudEventBody,
        {
          headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" },
        },
      );
      if (cloudEventRes.status !== 200) {
        errStatus.push(cloudEventRes.status);
      }
    } catch (e: any) {
      err = e as Error;
    }

    if (err || errStatus.length > 0) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        `Firebase Storage function was not triggered due to emulation error. Please file a bug.`,
      );
    }
  }

  /** Legacy Google Events type */
  private createLegacyEventRequestBody(
    action: StorageCloudFunctionAction,
    objectMetadataPayload: ObjectMetadataPayload,
  ) {
    const timestamp = new Date();
    return {
      eventId: `${timestamp.getTime()}`,
      timestamp: toSerializedDate(timestamp),
      eventType: `google.storage.object.${action}`,
      resource: {
        service: "storage.googleapis.com",
        name: `projects/_/buckets/${objectMetadataPayload.bucket}/objects/${objectMetadataPayload.name}`,
        type: "storage#object",
      }, // bucket
      data: objectMetadataPayload,
    };
  }

  /** Modern CloudEvents type */
  private createCloudEventRequestBody(
    action: StorageCloudFunctionAction,
    objectMetadataPayload: ObjectMetadataPayload,
  ): CloudEvent<StorageObjectData> {
    const ceAction = STORAGE_V2_ACTION_MAP[action];
    if (!ceAction) {
      throw new Error("Action is not defined as a CloudEvents action");
    }
    const data = objectMetadataPayload as unknown as StorageObjectData;
    let time = new Date().toISOString();
    if (data.updated) {
      time = typeof data.updated === "string" ? data.updated : data.updated.toISOString();
    }
    return {
      specversion: "1.0",
      id: uuid.v4(),
      type: `google.cloud.storage.object.v1.${ceAction}`,
      source: `//storage.googleapis.com/projects/_/buckets/${objectMetadataPayload.bucket}/objects/${objectMetadataPayload.name}`,
      time,
      data,
    };
  }
}

// From https://github.com/firebase/firebase-functions/blob/master/src/providers/storage.ts
export interface ObjectMetadataPayload {
  /** The kind of the object, which is always `storage#object`. */
  kind: string;

  /**
   * The ID of the object, including the bucket name, object name, and
   * generation number.
   */
  id: string;

  /** Storage bucket that contains the object. */
  bucket: string;

  /** Storage class of the object. */
  storageClass: string;

  /**
   * The value of the `Content-Length` header, used to determine  the length of
   * the object data in bytes.
   */
  size: string;

  /** The creation time of the object in RFC 3339 format. */
  timeCreated: string;

  /**
   * The modification time of the object metadata in RFC 3339 format.
   */
  updated: string;

  /** Link to access the object, assuming you have sufficient permissions. */
  selfLink?: string;

  /** The object's name. */
  name?: string;

  /**
   * Generation version number that changes each time the object is
   * overwritten.
   */
  generation?: string;

  /** The object's content type, also known as the MIME type. */
  contentType?: string;

  /**
   * Meta-generation version number that changes each time the object's metadata
   * is updated.
   */
  metageneration?: string;

  /**
   * The deletion time of the object in RFC 3339 format. Returned
   * only if this version of the object has been deleted.
   */
  timeDeleted?: string;

  timeStorageClassUpdated?: string;

  /**
   * MD5 hash for the object. All Google Cloud Storage objects
   * have a CRC32C hash or MD5 hash.
   */
  md5Hash?: string;

  /** Media download link. */
  mediaLink?: string;

  /**
   * Content-Encoding to indicate that an object is compressed
   * (for example, with gzip compression) while maintaining its Content-Type.
   */
  contentEncoding?: string;

  /**
   * The value of the `Content-Disposition` header, used to specify presentation
   * information about the data being transmitted.
   */
  contentDisposition?: string;

  /** ISO 639-1 language code of the content. */
  contentLanguage?: string;

  /**
   * The value of the `Cache-Control` header, used to determine whether Internet
   * caches are allowed to cache public data for an object.
   */
  cacheControl?: string;

  /** User-provided metadata. */
  metadata?: {
    [key: string]: string;
  };

  acl?: [
    {
      kind?: string;
      id?: string;
      selfLink?: string;
      bucket?: string;
      object?: string;
      generation?: string;
      entity?: string;
      role?: string;
      email?: string;
      entityId?: string;
      domain?: string;
      projectTeam?: {
        projectNumber?: string;
        team?: string;
      };
      etag?: string;
    },
  ];

  owner?: {
    entity?: string;
    entityId?: string;
  };

  /**
   * The object's CRC32C hash. All Google Cloud Storage objects
   * have a CRC32C hash or MD5 hash.
   */
  crc32c?: string;

  /**
   * Specifies the number of originally uploaded objects from which
   * a composite object was created.
   */
  componentCount?: string;

  etag?: string;

  /**
   * Customer-supplied encryption key.
   *
   * This object contains the following properties:
   * `encryptionAlgorithm` (`string|undefined`): The encryption algorithm that
   *   was used. Always contains the value `AES256`.
   * `keySha256` (`string|undefined`): An RFC 4648 base64-encoded string of the
   *   SHA256 hash of your encryption key. You can use this SHA256 hash to
   *   uniquely identify the AES-256 encryption key required to decrypt the
   *   object, which you must store securely.
   */
  customerEncryption?: {
    encryptionAlgorithm?: string;
    keySha256?: string;
  };
}
