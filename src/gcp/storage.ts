import { Readable } from "stream";
import * as path from "path";
import * as clc from "colorette";
import { getProject } from "../management/projects";

import { firebaseStorageOrigin, storageOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrStatus } from "../error";
import { logger } from "../logger";
import { ensure } from "../ensureApiEnabled";
import * as utils from "../utils";

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

export interface CreateBucketRequest {
  name: string;
  location: string;
  lifecycle: {
    rule: LifecycleRule[];
  };
}

export interface LifecycleRule {
  action: {
    type: string;
  };
  condition: {
    age: number;
  };
}

interface UploadObjectResponse {
  selfLink: string;
  mediaLink: string;
}

/** Response type for obtaining the storage service agent */
interface StorageServiceAccountResponse {
  email_address: string;
  kind: string;
}

export interface FirebaseMetadata {
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
  downloadTokens?: string;
}

export async function getDefaultBucket(projectId: string): Promise<string> {
  await ensure(projectId, firebaseStorageOrigin(), "storage", false);
  try {
    const localAPIClient = new Client({
      urlPrefix: firebaseStorageOrigin(),
      apiVersion: "v1alpha",
    });
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
  ignoreQuotaProject?: boolean,
): Promise<{ generation: string | null }> {
  const url = new URL(uploadUrl, storageOrigin());
  const isSignedUrl = url.searchParams.has("GoogleAccessId");
  const localAPIClient = new Client({ urlPrefix: url.origin, auth: !isSignedUrl });
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
    ignoreQuotaProject,
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
): Promise<{
  bucket: string;
  object: string;
  generation: string | null;
}> {
  if (path.extname(source.file) !== ".zip") {
    throw new FirebaseError(`Expected a file name ending in .zip, got ${source.file}`);
  }
  const localAPIClient = new Client({ urlPrefix: storageOrigin() });
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
 * Get a storage object from GCP.
 * @param {string} bucketName name of the storage bucket that contains the object
 * @param {string} objectName name of the object
 */
export async function getObject(
  bucketName: string,
  objectName: string,
): Promise<UploadObjectResponse> {
  const client = new Client({ urlPrefix: storageOrigin() });
  const res = await client.get<UploadObjectResponse>(`/storage/v1/b/${bucketName}/o/${objectName}`);
  return res.body;
}

/**
 * Deletes an object via Firebase Storage.
 * @param {string} location A Firebase Storage location, of the form "/v0/b/<bucket>/o/<object>"
 */
export function deleteObject(location: string): Promise<any> {
  const localAPIClient = new Client({ urlPrefix: storageOrigin() });
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
    const localAPIClient = new Client({ urlPrefix: storageOrigin() });
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
 * Creates a storage bucket on GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/insert
 * @param {string} bucketName name of the storage bucket
 * @return a bucket resource object
 */
export async function createBucket(
  projectId: string,
  req: CreateBucketRequest,
  projectPrivate?: boolean,
): Promise<BucketResponse> {
  const queryParams: Record<string, string> = {
    project: projectId,
  };
  // TODO: This should probably be always on, but we need to audit the other cases of this method to
  // make sure we don't break anything.
  if (projectPrivate) {
    queryParams["predefinedAcl"] = "projectPrivate";
    queryParams["predefinedDefaultObjectAcl"] = "projectPrivate";
  }

  try {
    const localAPIClient = new Client({ urlPrefix: storageOrigin() });
    const result = await localAPIClient.post<CreateBucketRequest, BucketResponse>(
      `/storage/v1/b`,
      req,
      { queryParams },
    );
    return result.body;
  } catch (err: any) {
    logger.debug(err);
    throw new FirebaseError("Failed to create the storage bucket", {
      original: err,
    });
  }
}

/**
 * Creates a storage bucket on GCP if it does not already exist.
 */
export async function upsertBucket(opts: {
  product: string;
  createMessage: string;
  projectId: string;
  req: CreateBucketRequest;
}): Promise<void> {
  try {
    const bucketResponse = await (exports as { getBucket: typeof getBucket }).getBucket(opts.req.name);
    const projectMetadata = await getProject(opts.projectId);
    if (!bucketResponse.projectNumber || bucketResponse.projectNumber !== projectMetadata.projectNumber) {
      throw new FirebaseError("There is already an existing bucket that belongs to another project.");
    }
    return;
  } catch (err) {
    const errStatus = getErrStatus((err as FirebaseError).original);
    // Unfortunately, requests for a non-existent bucket from the GCS API sometimes return 403 responses as well as 404s.
    // We must attempt to create a new bucket on both 403s and 404s.
    if (errStatus !== 403 && errStatus !== 404) {
      throw err;
    }
  }

  utils.logLabeledBullet(opts.product, opts.createMessage);
  try {
    await (exports as { createBucket: typeof createBucket }).createBucket(
      opts.projectId,
      opts.req,
      true /* projectPrivate */,
    );
  } catch (err) {
    if (getErrStatus((err as FirebaseError).original) === 403) {
      utils.logLabeledWarning(
        opts.product,
        "Failed to create Cloud Storage bucket because user does not have sufficient permissions. " +
          "See https://cloud.google.com/storage/docs/access-control/iam-roles for more details on " +
          "IAM roles that are able to create a Cloud Storage bucket, and ask your project administrator " +
          "to grant you one of those roles.",
      );
    }
    throw err;
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
    const localAPIClient = new Client({ urlPrefix: storageOrigin() });
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
    const localAPIClient = new Client({ urlPrefix: storageOrigin() });
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

/**
 * getDownloadUrl finds a publicly accessible download url for an object in Firebase storage.
 * @param bucketName the bucket which contains the object you are looking for.
 * @param objectPath a path within the bucket where the obejct resides.
 * @return the string HTTP path to download the object.
 */
export async function getDownloadUrl(
  bucketName: string,
  objectPath: string,
  emulatorUrl?: string,
): Promise<string> {
  try {
    const origin = emulatorUrl || firebaseStorageOrigin();
    const localAPIClient = new Client({ urlPrefix: origin });
    const response = await localAPIClient.get<FirebaseMetadata>(
      `/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}`,
    );

    if (emulatorUrl) {
      return `${origin}/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media`;
    }

    if (!response.body.downloadTokens) {
      throw new Error(
        `no download tokens exist for ${objectPath}, please visit the Firebase console to make one`,
      );
    }
    const [token] = response.body.downloadTokens.split(",");
    return `${origin}/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  } catch (err: any) {
    logger.error(err);
    throw new FirebaseError(
      `${err} Check that you have permission in the Firebase console to generate a download token`,
      {
        original: err,
      },
    );
  }
}
