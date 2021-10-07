import { EmulatorRegistry } from "../registry";
import { EmulatorInfo, Emulators } from "../types";
import * as request from "request";
import { EmulatorLogger } from "../emulatorLogger";
import { CloudStorageObjectMetadata, toSerializedDate } from "./metadata";
import { Client } from "../../apiv2";
import { SignatureType } from "../functionsEmulatorShared";

type StorageCloudFunctionAction = "finalize" | "metadataUpdate" | "delete" | "archive";
const STORAGE_ACTION_MAP: Record<string, string> = {
  finalize: "finalized",
  metadataUpdate: "metadataUpdated",
  delete: "deleted",
  archive: "archived",
};

export class StorageCloudFunctions {
  private logger = EmulatorLogger.forEmulator(Emulators.STORAGE);
  private functionsEmulatorInfo?: EmulatorInfo;
  private multicastOrigin = "";
  private multicastPath = "";
  private enabled = false;
  private client: Client = new Client({ urlPrefix: "" });

  constructor(private projectId: string) {
    const functionsEmulator = EmulatorRegistry.get(Emulators.FUNCTIONS);

    if (functionsEmulator) {
      this.enabled = true;
      this.functionsEmulatorInfo = functionsEmulator.getInfo();
      this.multicastOrigin = `http://${EmulatorRegistry.getInfoHostString(
        this.functionsEmulatorInfo
      )}`;
      this.multicastPath = `/functions/projects/${projectId}/trigger_multicast`;
      this.client = new Client({ urlPrefix: this.multicastOrigin, auth: false });
    }
  }

  public async dispatch(
    action: StorageCloudFunctionAction,
    object: CloudStorageObjectMetadata
  ): Promise<void> {
    if (!this.enabled) return;

    const statusList: Array<number> = [];
    const errors: Array<Error> = [];
    try {
      /** Legacy Google Events */
      const eventBody = this.createEventRequestBody(action, "event", object);
      const eventRes = await this.client.post(this.multicastPath, eventBody);
      if (eventRes.status !== 200) {
        statusList.push(eventRes.status);
      }
      /** Modern CloudEvents */
      const cloudEventBody = this.createEventRequestBody(action, "cloudevent", object);
      const cloudEventRes = await this.client.post(this.multicastPath, cloudEventBody);
      if (cloudEventRes.status !== 200) {
        statusList.push(cloudEventRes.status);
      }
    } catch (e) {
      errors.push(e as Error);
    }

    if (errors.length > 0 || statusList.length > 0) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        `Firebase Storage function was not triggered due to emulation error. Please file a bug.`
      );
    }
  }

  private createEventRequestBody(
    action: StorageCloudFunctionAction,
    signatureType: SignatureType,
    objectMetadataPayload: ObjectMetadataPayload
  ): string {
    if (signatureType === "event") {
      const timestamp = new Date();
      return JSON.stringify({
        eventId: `${timestamp.getTime()}`,
        timestamp: toSerializedDate(timestamp),
        eventType: `google.storage.object.${action}`,
        resource: {
          service: "storage.googleapis.com",
          name: `projects/_/buckets/${objectMetadataPayload.bucket}/objects/${objectMetadataPayload.name}`,
          type: "storage#object",
        }, // bucket
        data: objectMetadataPayload,
      });
    } else if (signatureType === "cloudevent") {
      const ceAction = STORAGE_ACTION_MAP[action];
      const data = { ...objectMetadataPayload };
      delete (data as any).acl; // remove this field from cloud events
      const cloudEvent = {
        specVersion: 1,
        type: `google.cloud.storage.object.v1.${ceAction}`,
        source: `//storage.googleapis.com/projects/_/buckets/${objectMetadataPayload.bucket}/objects/${objectMetadataPayload.name}`,
        data,
      };
      return JSON.stringify({
        eventType: `google.cloud.storage.object.v1.${ceAction}`, // need this for multicast triggerId
        headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" }, // v2 api automatically adds Content-Type
        data: cloudEvent,
      });
    } else {
      throw new Error(`Invalid SignatureType for event triggers: ${signatureType}`);
    }
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
    }
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
   * * `encryptionAlgorithm` (`string|undefined`): The encryption algorithm that
   *   was used. Always contains the value `AES256`.
   * * `keySha256` (`string|undefined`): An RFC 4648 base64-encoded string of the
   *   SHA256 hash of your encryption key. You can use this SHA256 hash to
   *   uniquely identify the AES-256 encryption key required to decrypt the
   *   object, which you must store securely.
   */
  customerEncryption?: {
    encryptionAlgorithm?: string;
    keySha256?: string;
  };
}
