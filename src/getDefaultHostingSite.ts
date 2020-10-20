import * as logger from "./logger";
import { getFirebaseProject } from "./management/projects";

/**
 * Tries to determine the default hosting site for a project, else falls back to projectId.
 * @param options The command-line options object
 * @return The hosting site ID
 */
export async function getDefaultHostingSite(options: any): Promise<string> {
  const project = await getFirebaseProject(options.project);
  const site = project.resources?.hostingSite;
  if (!site) {
    logger.debug(
      `No default hosting site found for project: ${options.project}. Using projectId as hosting site name.`
    );
    return options.project;
  }
  return site;
}
