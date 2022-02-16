import * as path from "path";

import * as api from "../api";
import { logger } from "../logger";
import { FirebaseError } from "../error";

/** Bucket Interface */
interface BucketResponse {
  kind: string;
  id: string;
  selfLink: string;
  projectNumber: string;
  name: string;
  timeCreated: string;
  updated: string;
  defaultEventBasedHold: boolean;
  retentionPolicy: {
    retentionPeriod: number;
    effectiveTime: string;
    isLocked: boolean;
  };
  metageneration: number;
  acl: [
    {
      kind: string;
      id: string;
      selfLink: string;
      bucket: string;
      entity: string;
      role: string;
      email: string;
      entityId: string;
      domain: string;
      projectTeam: {
        projectNumber: string;
        team: string;
      };
      etag: string;
    }
  ];
  defaultObjectAcl: [
    {
      kind: string;
      entity: string;
      role: string;
      email: string;
      entityId: string;
      domain: string;
      projectTeam: {
        projectNumber: string;
        team: string;
      };
      etag: string;
    }
  ];
  iamConfiguration: {
    publicAccessPrevention: string;
    uniformBucketLevelAccess: {
      enabled: boolean;
      lockedTime: string;
    };
  };
  encryption: {
    defaultKmsKeyName: string;
  };
  owner: {
    entity: string;
    entityId: string;
  };
  location: string;
  locationType: string;
  rpo: string;
  website: {
    mainPageSuffix: string;
    notFoundPage: string;
  };
  logging: {
    logBucket: string;
    logObjectPrefix: string;
  };
  versioning: {
    enabled: boolean;
  };
  cors: [
    {
      origin: [string];
      method: [string];
      responseHeader: [string];
      maxAgeSeconds: number;
    }
  ];
  lifecycle: {
    rule: [
      {
        action: {
          type: string;
          storageClass: string;
        };
        condition: {
          age: number;
          createdBefore: string;
          customTimeBefore: string;
          daysSinceCustomTime: number;
          daysSinceNoncurrentTime: number;
          isLive: boolean;
          matchesStorageClass: [string];
          noncurrentTimeBefore: string;
          numNewerVersions: number;
        };
      }
    ];
  };
  labels: {
    (key: any): string;
  };
  storageClass: string;
  billing: {
    requesterPays: boolean;
  };
  etag: string;
}

/** Response type for obtaining the storage service agent */
interface StorageServiceAccountResponse {
  email_address: string;
  kind: string;
}

export async function getDefaultBucket(projectId?: string): Promise<string> {
  try {
    const resp = await api.request("GET", "/v1/apps/" + projectId, {
      auth: true,
      origin: api.appengineOrigin,
    });
    if (resp.body.defaultBucket === "undefined") {
      logger.debug("Default storage bucket is undefined.");
      throw new FirebaseError(
        "Your project is being set up. Please wait a minute before deploying again."
      );
    }
    return resp.body.defaultBucket;
  } catch (err: any) {
    logger.info(
      "\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support."
    );
    throw err;
  }
}

export async function upload(
  source: any,
  uploadUrl: string,
  extraHeaders?: Record<string, string>
): Promise<any> {
  const url = new URL(uploadUrl);
  const result = await api.request("PUT", url.pathname + url.search, {
    data: source.stream,
    headers: {
      "Content-Type": "application/zip",
      ...extraHeaders,
    },
    json: false,
    origin: url.origin,
    logOptions: { skipRequestBody: true },
  });

  return {
    generation: result.response.headers["x-goog-generation"],
  };
}

/**
 * Uploads a zip file to the specified bucket using the firebasestorage api.
 * @param {!Object<string, *>} source a zip file to upload. Must contain:
 *    - `file` {string}: file name
 *    - `stream` {Stream}: read stream of the archive
 * @param {string} bucketName a bucket to upload to
 */
export async function uploadObject(source: any, bucketName: string): Promise<any> {
  if (path.extname(source.file) !== ".zip") {
    throw new FirebaseError(`Expected a file name ending in .zip, got ${source.file}`);
  }
  const location = `/${bucketName}/${path.basename(source.file)}`;
  const result = await api.request("PUT", location, {
    auth: true,
    data: source.stream,
    headers: {
      "Content-Type": "application/zip",
      "x-goog-content-length-range": "0,123289600",
    },
    json: false,
    origin: api.storageOrigin,
    logOptions: { skipRequestBody: true },
  });
  return {
    bucket: bucketName,
    object: path.basename(source.file),
    generation: result.response.headers["x-goog-generation"],
  };
}

/**
 * Deletes an object via Firebase Storage.
 * @param {string} location A Firebase Storage location, of the form "/v0/b/<bucket>/o/<object>"
 */
export function deleteObject(location: string): Promise<any> {
  return api.request("DELETE", location, {
    auth: true,
    origin: api.storageOrigin,
  });
}

/**
 * Gets a storage bucket from GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/get
 * @param {string} bucketName name of the storage bucket
 * @returns a bucket resource object
 */
export async function getBucket(bucketName: string): Promise<BucketResponse> {
  try {
    const result = await api.request("GET", `/storage/v1/b/${bucketName}`, {
      auth: true,
      origin: api.storageOrigin,
    });
    return result.body;
  } catch (err: any) {
    logger.debug(err);
    throw new FirebaseError("Failed to obtain the storage bucket", {
      original: err,
    });
  }
}

/**
 * Find the service account for the Cloud Storage Resource
 * @param {string} projectId the project identifier
 *
 * @returns:
 * {
 *  "email_address": string,
 *  "kind": "storage#serviceAccount",
 * }
 */
export async function getServiceAccount(projectId: string): Promise<StorageServiceAccountResponse> {
  try {
    const response = await api.request("GET", `/storage/v1/projects/${projectId}/serviceAccount`, {
      auth: true,
      origin: api.storageOrigin,
    });
    return response.body;
  } catch (err: any) {
    logger.debug(err);
    throw new FirebaseError("Failed to obtain the Cloud Storage service agent", {
      original: err,
    });
  }
}
