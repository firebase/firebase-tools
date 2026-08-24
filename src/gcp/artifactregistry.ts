import { Client } from "../apiv2";
import { artifactRegistryDomain } from "../api";
import { assertImplements, DeepOmit, RecursiveKeyOf } from "../metaprogramming";
import * as api from "../ensureApiEnabled";
import * as proto from "./proto";
import { pollOperation } from "../operation-poller";

export const API_VERSION = "v1";

const client = new Client({
  urlPrefix: artifactRegistryDomain(),
  auth: true,
  apiVersion: API_VERSION,
});

/**
 * Ensures that the Artifact Registry API is enabled for the specified project.
 *
 * @param projectId The GCP project ID.
 * @return A promise that resolves when the API is confirmed enabled.
 */
export function ensureApiEnabled(projectId: string): Promise<void> {
  return api.ensure(projectId, artifactRegistryDomain(), "artifactregistry", true);
}

export interface Repository {
  name: string;
  format: string;
  description: string;
  createTime: string;
  updateTime: string;
  cleanupPolicies?: Record<string, CleanupPolicy | undefined>;
  cleanupPolicyDryRun?: boolean;
  labels?: Record<string, string>;
}

export type RepositoryOutputOnlyFields = "format" | "description" | "createTime" | "updateTime";
// This line caues a compile-time error if RepositoryOutputOnlyFields has a field that is
// missing in Repository or incompatible with the type in Repository.
assertImplements<RepositoryOutputOnlyFields, RecursiveKeyOf<Repository>>();

export type RepositoryInput = DeepOmit<Repository, RepositoryOutputOnlyFields>;

export interface Operation {
  name: string;
  done: boolean;
  error?: { code: number; message: string; details: unknown };
  response?: {
    "@type": "type.googleapis.com/google.protobuf.Empty";
  };
  metadata?: {
    "@type": "type.googleapis.com/google.devtools.artifactregistry.v1beta2.OperationMetadata";
  };
}

export interface CleanupPolicyCondition {
  tagState: string;
  olderThan: string;
  packageNamePrefixes?: string[];
  tagPrefixes?: string[];
  versionNamePrefixes?: string[];
  newerThan?: string;
}

export interface CleanupPolicyMostRecentVersions {
  packageNamePrefixes?: string[];
  keepCount: number;
}

export interface CleanupPolicy {
  id: string;
  action: string;
  condition?: CleanupPolicyCondition;
  mostRecentVersions?: CleanupPolicyMostRecentVersions;
}

/** Delete a package. */
export async function deletePackage(name: string): Promise<Operation> {
  const res = await client.delete<Operation>(name);
  return res.body;
}

/**
 * Get a repository from Artifact Registry.
 */
export async function getRepository(repoPath: string): Promise<Repository> {
  const res = await client.get<Repository>(repoPath);
  return res.body;
}

/**
 * Update an Artifact Registry repository.
 */
export async function updateRepository(repo: RepositoryInput): Promise<Repository> {
  const updateMask = proto.fieldMasks(repo, "cleanupPolicies", "cleanupPolicyDryRun", "labels");
  if (updateMask.length === 0) {
    const res = await client.get<Repository>(repo.name!);
    return res.body;
  }
  const res = await client.patch<RepositoryInput, Repository>(`/${repo.name}`, repo, {
    queryParams: { updateMask: updateMask.join(",") },
  });
  return res.body;
}

/**
 * Creates an Artifact Registry repository.
 */
export async function createRepository(
  projectId: string,
  location: string,
  repositoryId: string,
  format = "DOCKER",
): Promise<Repository> {
  const res = await client.post<any, any>(
    `/projects/${projectId}/locations/${location}/repositories`,
    {
      format,
      description: "Cloud Run Source Deploy Repository",
    },
    {
      queryParams: {
        repositoryId,
      },
    },
  );
  if (res.body?.name && !res.body.done) {
    return await pollOperation<Repository>({
      apiOrigin: artifactRegistryDomain(),
      apiVersion: API_VERSION,
      operationResourceName: res.body.name,
      masterTimeout: 5 * 60 * 1000,
      backoff: 1000,
      maxBackoff: 5000,
    });
  }
  return res.body;
}

/**
 * Ensures an Artifact Registry repository exists, creating it if not.
 */
export async function ensureRepositoryExists(
  projectId: string,
  location: string,
  repositoryId: string,
  format = "DOCKER",
): Promise<void> {
  const name = `projects/${projectId}/locations/${location}/repositories/${repositoryId}`;
  try {
    await getRepository(name);
  } catch (err: any) {
    if (err.status === 404) {
      try {
        await createRepository(projectId, location, repositoryId, format);
      } catch (createErr: any) {
        // 409 Already Exists: repository was created concurrently or already exists, safe to ignore.
        if (createErr.status === 409) {
          return;
        }
        throw createErr;
      }
      // 409 Already Exists from getRepository (e.g. repository state conflict), safe to ignore.
    } else if (err.status === 409) {
      return;
    } else {
      throw err;
    }
  }
}
