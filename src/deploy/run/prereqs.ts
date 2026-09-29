import { ensure } from "../../ensureApiEnabled";
import * as artifactregistry from "../../gcp/artifactregistry";

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
