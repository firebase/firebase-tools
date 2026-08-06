import { Options } from "../../options";
import { ensure } from "../../ensureApiEnabled";

/**
 *
 */
export async function prereqs(options: Options, projectId: string): Promise<void> {
  await ensure(projectId, "run.googleapis.com", "deploy", true);
  await ensure(projectId, "cloudbuild.googleapis.com", "deploy", true);
  await ensure(projectId, "storage.googleapis.com", "deploy", true);
  await ensure(projectId, "artifactregistry.googleapis.com", "deploy", true);
}
