import { ensure } from "../ensureApiEnabled";
import * as getProjectId from "../getProjectId";

/**
 * Ensures the Firebase ML API is enabled for the project.
 * @param options options for silent execution or not using options.markdown.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureFirebaseMlApiEnabled(options: any): Promise<void> {
  const projectId = getProjectId(options);
  return await ensure(projectId, "firebaseml.googleapis.com", "ml", options.markdown);
}

/**
 * Validates that the modelId has the proper format (non-empty, numeric string).
 * @param modelId The model ID to validate
 * @return {boolean} True if the model ID is valid. Otherwise false.
 */
export function isValidModelId(modelId: string): boolean {
  if (!modelId) {
    return false;
  }
  return !isNaN(Number(modelId));
}
