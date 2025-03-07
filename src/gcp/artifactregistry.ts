import { Client } from "../apiv2";
import { artifactRegistryDomain } from "../api";
import { needProjectId } from "../projectUtils";
import * as api from "../ensureApiEnabled";

export const API_VERSION = "v1";

const client = new Client({
  urlPrefix: artifactRegistryDomain(),
  auth: true,
  apiVersion: API_VERSION,
});

export function ensureApiEnabled(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return api.ensure(projectId, artifactRegistryDomain(), "artifactregistry", true);
}

export interface Repository {
  name: string;
  format: string;
  description: string;
  createTime: string;
  updateTime: string;
  cleanupPolicies?: Record<string, CleanupPolicy>;
}

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

// Interfaces for Artifact Registry cleanup policies
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

export interface RepositoryPatch {
  cleanupPolicies: Record<string, CleanupPolicy>;
  cleanupPolicyDryRun?: boolean;
}

/** Delete a package. */
export async function deletePackage(name: string): Promise<Operation> {
  const res = await client.delete<Operation>(name);
  return res.body;
}

/**
 * Get a repository from Artifact Registry.
 * @param repoPath The full path to the repository
 * @returns The repository details
 */
export async function getRepository(repoPath: string): Promise<Repository> {
  const res = await client.get<Repository>(repoPath);
  return res.body;
}

/**
 * Apply a patch to an Artifact Registry repository.
 * @param repoPath The full path to the repository
 * @param patchRequest The patch to apply
 * @param updateMask The update mask specifying which fields to update
 */
export async function patchRepository(
  repoPath: string,
  patchRequest: RepositoryPatch,
  updateMask: string,
): Promise<void> {
  await client.patch<unknown, RepositoryPatch>(repoPath, patchRequest, {
    queryParams: { updateMask },
  });
}

export type Permissions = { permissions: string[] };

/**
 * Test IAM permissions for an Artifact Registry resource.
 * @param resource The full resource path to check permissions on
 * @param permissions Array of permissions to check
 * @returns Object containing the permissions that the caller has
 */
export async function testIamPermissions(
  resource: string,
  permissions: string[],
): Promise<Permissions> {
  const res = await client.post<Permissions, Permissions>(`${resource}:testIamPermissions`, {
    permissions,
  });
  return res.body;
}
