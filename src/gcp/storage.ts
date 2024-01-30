import { Readable } from "stream";
import * as path from "path";
import * as clc from "colorette";

import { firebaseStorageOrigin, storageOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { ensure } from "../ensureApiEnabled";

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
    },
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
    },
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
    },
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
      },
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

interface ListBucketsResponse {
  kind: string;
  nextPageToken: string;
  items: [
    {
      name: string;
    },
  ];
}

interface GetDefaultBucketResponse {
  name: string;
  location: string;
  bucket: {
    name: string;
  };
}

/** Response type for obtaining the storage service agent */
interface StorageServiceAccountResponse {
  email_address: string;
  kind: string;
}

export async function getDefaultBucket(projectId: string): Promise<string> {
  await ensure(projectId, "firebasestorage.googleapis.com", "storage", false);
  try {
    const localAPIClient = new Client({ urlPrefix: firebaseStorageOrigin, apiVersion: "v1alpha" });
    const response = await localAPIClient.get<GetDefaultBucketResponse>(
      `/projects/${projectId}/defaultBucket`,
    );
    if (!response.body?.bucket.name) {
      logger.debug("Default storage bucket is undefined.");
      throw new FirebaseError(
        "Your project is being set up. Please wait a minute before deploying again.",
      );
    }
    return response.body.bucket.name.split("/").pop()!;
  } catch (err: any) {
    if (err?.status === 404) {
      throw new FirebaseError(
        `Firebase Storage has not been set up on project '${clc.bold(
          projectId,
        )}'. Go to https://console.firebase.google.com/project/${projectId}/storage and click 'Get Started' to set up Firebase Storage.`,
      );
    }
    logger.info("\n\nUnexpected error when fetching default storage bucket.");
    throw err;
  }
}

export async function upload(
  source: any,
  uploadUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<any> {
  const url = new URL(uploadUrl);
  const localAPIClient = new Client({ urlPrefix: url.origin, auth: false });
  const res = await localAPIClient.request({
    method: "PUT",
    path: url.pathname,
    queryParams: url.searchParams,
    responseType: "xml",
    headers: {
      "content-type": "application/zip",
      ...extraHeaders,
    },
    body: source.stream,
    skipLog: { resBody: true },
  });
  return {
    generation: res.response.headers.get("x-goog-generation"),
  };
}

/**
 * Uploads a zip file to the specified bucket using the firebasestorage api.
 */
export async function uploadObject(
  /** Source with file (name) to upload, and stream of file. */
  source: { file: string; stream: Readable },
  /** Bucket to upload to. */
  bucketName: string,
): Promise<{ bucket: string; object: string; generation: string | null }> {
  if (path.extname(source.file) !== ".zip") {
    throw new FirebaseError(`Expected a file name ending in .zip, got ${source.file}`);
  }
  const localAPIClient = new Client({ urlPrefix: storageOrigin });
  const location = `/${bucketName}/${path.basename(source.file)}`;
  const res = await localAPIClient.request({
    method: "PUT",
    path: location,
    headers: {
      "Content-Type": "application/zip",
      "x-goog-content-length-range": "0,123289600",
    },
    body: source.stream,
  });
  return {
    bucket: bucketName,
    object: path.basename(source.file),
    generation: res.response.headers.get("x-goog-generation"),
  };
}

/**
 * Deletes an object via Firebase Storage.
 * @param {string} location A Firebase Storage location, of the form "/v0/b/<bucket>/o/<object>"
 */
export function deleteObject(location: string): Promise<any> {
  const localAPIClient = new Client({ urlPrefix: storageOrigin });
  return localAPIClient.delete(location);
}

/**
 * Gets a storage bucket from GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/get
 * @param {string} bucketName name of the storage bucket
 * @return a bucket resource object
 */
export async function getBucket(bucketName: string): Promise<BucketResponse> {
  try {
    const localAPIClient = new Client({ urlPrefix: storageOrigin });
    const result = await localAPIClient.get<BucketResponse>(`/storage/v1/b/${bucketName}`);
    return result.body;
  } catch (err: any) {
    logger.debug(err);
    throw new FirebaseError("Failed to obtain the storage bucket", {
      original: err,
    });
  }
}

/**
 * Gets the list of storage buckets associated with a specific project from GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/list
 * @param {string} bucketName name of the storage bucket
 * @return a bucket resource object
 */
export async function listBuckets(projectId: string): Promise<Array<string>> {
  try {
    const localAPIClient = new Client({ urlPrefix: storageOrigin });
    const result = await localAPIClient.get<ListBucketsResponse>(
      `/storage/v1/b?project=${projectId}`,
    );
    return result.body.items.map((bucket: { name: string }) => bucket.name);
  } catch (err: any) {
    logger.debug(err);
    throw new FirebaseError("Failed to read the storage buckets", {
      original: err,
    });
  }
}

/**
 * Find the service account for the Cloud Storage Resource
 * @param {string} projectId the project identifier
 * @returns:
 * {
 *  "email_address": string,
 *  "kind": "storage#serviceAccount",
 * }
 */
export async function getServiceAccount(projectId: string): Promise<StorageServiceAccountResponse> {
  try {
    const localAPIClient = new Client({ urlPrefix: storageOrigin });
    const response = await localAPIClient.get<StorageServiceAccountResponse>(
      `/storage/v1/projects/${projectId}/serviceAccount`,
    );
    return response.body;
  } catch (err: any) {
    logger.debug(err);
    throw new FirebaseError("Failed to obtain the Cloud Storage service agent", {
      original: err,
    });
  }
}
