import { getFirebaseProject } from "./management/projects";
import * as getProjectId from "./getProjectId";

/**
 * Fetches the project number.
 * @param options CLI options.
 * @return the project number, as a string.
 */
export async function getProjectNumber(options: any): Promise<string> {
  if (options.projectNumber) {
    return options.projectNumber;
  }
  const projectId = getProjectId(options);
  const metadata = await getFirebaseProject(projectId);
  options.projectNumber = metadata.projectNumber;
  return options.projectNumber;
}
