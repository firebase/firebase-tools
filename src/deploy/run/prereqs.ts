import { Options } from "../../options";
import { ensure } from "../../ensureApiEnabled";
import * as artifactregistry from "../../gcp/artifactregistry";

/**
 * Checks and ensures necessary GCP APIs are enabled before deploying Cloud Run services.
 */
export async function prereqs(options: Options, projectId: string): Promise<void> {
  await Promise.all([
    ensure(projectId, "run.googleapis.com", "run", true),
    ensure(projectId, "cloudbuild.googleapis.com", "cloudbuild", true),
    ensure(projectId, "storage.googleapis.com", "storage", true),
    artifactregistry.ensureApiEnabled(projectId),
  ]);
}
