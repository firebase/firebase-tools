import { Readable } from "stream";
import * as path from "path";
import * as clc from "colorette";
import { randomInt } from "crypto";

import { firebaseStorageOrigin, storageOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrStatus } from "../error";
import { logger } from "../logger";
import { ensure } from "../ensureApiEnabled";
import * as utils from "../utils";
import { fieldMasks } from "./proto";

/** Content Type **/
export enum ContentType {
  ZIP = "ZIP",
  TAR = "TAR",
}

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
  labels: Record<string, string>;
  storageClass: string;
  billing: {
    requesterPays: boolean;
  };
  etag: string;
}

interface ListBucketsResponse {
  kind: string;
  nextPageToken: string;
  items: BucketResponse[];
}

interface GetDefaultBucketResponse {
  name: string;
  location: string;
  bucket: {
    name: string;
  };
}

export interface UpsertBucketRequest {
  baseName: string;
  location: string;
  purposeLabel: string;
  lifecycle?: {
    rule: LifecycleRule[];
  };
  iamConfiguration?: {
    uniformBucketLevelAccess: {
      enabled: boolean;
    };
  };
}

export interface CreateBucketRequest {
  name: string;
  location: string;
  labels?: Record<string, string>;
  lifecycle?: {
    rule: LifecycleRule[];
  };
  iamConfiguration?: {
    uniformBucketLevelAccess: {
      enabled: boolean;
    };
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
 * Uploads a zip or tar file to the specified bucket using the firebasestorage api.
 */
export async function uploadObject(
  /** Source with file (name) to upload, and stream of file. */
  source: { file: string; stream: Readable },
  /** Bucket to upload to. */
  bucketName: string,
  contentType?: ContentType,
): Promise<{
  bucket: string;
  object: string;
  generation: string | null;
}> {
  switch (contentType) {
    case ContentType.TAR:
      if (!source.file.endsWith(".tar.gz")) {
        throw new FirebaseError(`Expected a file name ending in .tar.gz, got ${source.file}`);
      }
      break;
    default:
      if (path.extname(source.file) !== ".zip") {
        throw new FirebaseError(`Expected a file name ending in .zip, got ${source.file}`);
      }
  }

  const localAPIClient = new Client({ urlPrefix: storageOrigin() });
  const location = `/${bucketName}/${path.basename(source.file)}`;
  const res = await localAPIClient.request({
    method: "PUT",
    path: location,
    headers: {
      "Content-Type":
        contentType === ContentType.TAR ? "application/octet-stream" : "application/zip",
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
 * Patches a storage bucket on GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/patch
 * @param bucketName name of the storage bucket
 * @param metadata the bucket resource metadata to patch
 * @return a bucket resource object
 */
export async function patchBucket(
  bucketName: string,
  metadata: Partial<BucketResponse>,
): Promise<BucketResponse> {
  try {
    const localAPIClient = new Client({ urlPrefix: storageOrigin() });
    const mask = fieldMasks(
      metadata,
      /* doNotRecurseIn = */ "labels",
      "acl",
      "defaultObjectAcl",
      "lifecycle",
    );
    const result = await localAPIClient.patch<Partial<BucketResponse>, BucketResponse>(
      `/storage/v1/b/${bucketName}`,
      metadata,
      { queryParams: { updateMask: mask.join(",") } },
    );
    return result.body;
  } catch (err: any) {
    logger.debug(err);
    throw new FirebaseError("Failed to patch the storage bucket", {
      original: err,
    });
  }
}

export function randomString(length: number): string {
  // NOTE: uppercase letters are not allowed in bucket names
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = length; i > 0; --i) {
    result += chars[randomInt(chars.length)];
  }
  return result;
}

// Call methods through the exports object so that they can be stubbed in tests.
const dynamicDispatch = exports as {
  listBuckets: typeof listBuckets;
  createBucket: typeof createBucket;
  patchBucket: typeof patchBucket;
  randomString: typeof randomString;
};

/**
 * Creates a storage bucket on GCP for a given purpose if it does not already exist.
 * NOTE: It is a security issue if the bucket already exists but is not owned by this project.
 * This function therefore only returns an existing bucket if it exists AND is in the project.
 * We check that the bucket is in the project by calling "listBuckets" (project scoped) rather than
 * getBucket (global scoped). If the bucket already exists, we use a name-collision nonce to avoid
 * a denial of service. To find this collision-avoiding in the future, we use a label as a breadcrumb.
 * Thus our base case of the bucket already existing uses the label not the base name to decide which
 * bucket to return.
 */
export async function upsertBucket(opts: {
  product: string;
  createMessage: string;
  projectId: string;
  req: UpsertBucketRequest;
}): Promise<string> {
  // Use labels to find whether an existing bucket is managed by us. Use labels, not the base name to detect
  // a bucket that was created with name conflict resolution.
  // Not using try/catch here because ignoring a failure could lead to multiple sources of truth.
  const existingBuckets = await dynamicDispatch.listBuckets(opts.projectId);
  const managedBucket = existingBuckets.find((b) => opts.req.purposeLabel in (b.labels || {}));
  if (managedBucket) {
    if (
      opts.req.iamConfiguration &&
      !managedBucket.iamConfiguration?.uniformBucketLevelAccess?.enabled
    ) {
      await dynamicDispatch.patchBucket(managedBucket.name, {
        iamConfiguration: opts.req.iamConfiguration as any,
      });
    }
    return managedBucket.name;
  }

  // Note: Some customers have created buckets before this new strategy of adding labels already existed.
  // If the bucket with the base name already exists _and is returned by listBuckets_, we know it is owned
  // by this project and is safet to use. Add the label.
  const existingUnmanaged = existingBuckets.find((b) => b.name === opts.req.baseName);
  if (existingUnmanaged) {
    logger.debug(
      `Found existing bucket ${existingUnmanaged.name} without purpose label. Because it is known not to be squatted, we can use it.`,
    );
    const labels = { ...existingUnmanaged.labels, [opts.req.purposeLabel]: "true" };
    const patch: Partial<BucketResponse> = { labels };
    if (opts.req.iamConfiguration) {
      patch.iamConfiguration = opts.req.iamConfiguration as any;
    }
    await dynamicDispatch.patchBucket(existingUnmanaged.name, patch);
    return existingUnmanaged.name;
  }

  utils.logLabeledBullet(opts.product, opts.createMessage);
  for (let retryCount = 0; retryCount < 5; retryCount++) {
    const name =
      retryCount === 0
        ? opts.req.baseName
        : `${opts.req.baseName}-${dynamicDispatch.randomString(6)}`;
    try {
      await dynamicDispatch.createBucket(
        opts.projectId,
        {
          name,
          location: opts.req.location,
          lifecycle: opts.req.lifecycle,
          iamConfiguration: opts.req.iamConfiguration,
          labels: {
            [opts.req.purposeLabel]: "true",
          },
        },
        true /* projectPrivate */,
      );
      return name;
    } catch (err) {
      if (getErrStatus((err as FirebaseError).original) === 409) {
        utils.logLabeledBullet(
          opts.product,
          `Bucket ${name} already exists, creating a new bucket with a conflict-avoiding hash`,
        );
        continue;
      }

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
  throw new FirebaseError("Failed to create a unique Cloud Storage bucket name after 5 attempts.");
}

/**
 * Gets the list of storage buckets associated with a specific project from GCP.
 * Ref: https://cloud.google.com/storage/docs/json_api/v1/buckets/list
 * @param {string} bucketName name of the storage bucket
 * @return a bucket resource object
 */
export async function listBuckets(projectId: string): Promise<BucketResponse[]> {
  try {
    let buckets: BucketResponse[] = [];
    const localAPIClient = new Client({ urlPrefix: storageOrigin() });
    let pageToken: string | undefined;
    do {
      const result = await localAPIClient.get<ListBucketsResponse>(
        `/storage/v1/b?project=${projectId}`,
        { queryParams: pageToken ? { pageToken } : {} },
      );
      buckets = buckets.concat(result.body.items || []);
      pageToken = result.body.nextPageToken;
    } while (pageToken);
    return buckets;
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
