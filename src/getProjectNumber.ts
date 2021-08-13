import { getFirebaseProject } from "./management/projects";
import { needProjectId } from "./projectUtils";
/**
 * Fetches the project number.
 * @param options CLI options.
 * @return the project number, as a string.
 */
export async function getProjectNumber(options: any): Promise<string> {
  if (options.projectNumber) {
    return options.projectNumber;
  }
  const projectId = needProjectId(options);
  const metadata = await getFirebaseProject(projectId);
  options.projectNumber = metadata.projectNumber;
  return options.projectNumber;
}
