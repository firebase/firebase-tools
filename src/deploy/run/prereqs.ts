import { ensure } from "../../ensureApiEnabled";
import * as artifactregistry from "../../gcp/artifactregistry";

export const RUN_PERMISSIONS = [
  "run.services.get",
  "run.services.create",
  "run.services.update",
  "run.services.setIamPolicy",
  "run.operations.get",
  "cloudbuild.builds.create",
  "cloudbuild.builds.get",
  // No bucket or object permissions: owners and editors get those from each bucket's
  // IAM policy, which this project-level check can't see.
  "storage.buckets.list",
  "storage.buckets.create",
  "artifactregistry.repositories.get",
  "artifactregistry.repositories.create",
  "artifactregistry.repositories.downloadArtifacts",
  "iam.serviceAccounts.actAs",
];

/**
 * Ensures that the APIs needed to build and deploy Cloud Run services are enabled.
 */
export async function prereqs(projectId: string): Promise<void> {
  await Promise.all([
    ensure(projectId, "run.googleapis.com", "run", true),
    ensure(projectId, "cloudbuild.googleapis.com", "cloudbuild", true),
    ensure(projectId, "storage.googleapis.com", "storage", true),
    artifactregistry.ensureApiEnabled(projectId),
  ]);
}
