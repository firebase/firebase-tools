import { getFirebaseProject } from "./management/projects";

/**
 * Tries to determine the default database instance for a project.
 * @param options The command-line options object
 * @return The instance ID, empty if it doesn't exist.
 */
export async function getDefaultDatabaseInstance(project: string): Promise<string> {
  const projectDetails = await getFirebaseProject(project);
  return projectDetails.resources?.realtimeDatabaseInstance || "";
}
