"use strict";

import { getFirebaseProject } from "./management/projects";

/**
 * Tries to determine the default database instance for a project.
 * @param options The command-line options object
 * @return The instance ID, empty if it doesn't exist.
 */
export async function getDefaultDatabaseInstance(options: any): Promise<string> {
  const projectDetails = await getFirebaseProject(options.project);
  if (projectDetails.resources && projectDetails.resources.realtimeDatabaseInstance) {
    return projectDetails.resources.realtimeDatabaseInstance;
  }
  return "";
}
