import * as logger from "./logger";
import { getFirebaseProject } from "./management/projects";
import * as _ from "lodash";

/**
 * Tries to determine the default hosting site for a project, else falls back to projectId.
 * @param {Object} options The command-line options object
 * @returns {Promise<String>} The hosting site ID
 */
export async function getDefaultHostingSite(options: any): Promise<string> {
  const project = await getFirebaseProject(options.project);
  if (!_.has(project, "resources.hostingSite")) {
    logger.debug(
      `No default hostingSite found for project: ${options.project}. Using projectId as hosting site name.`
    );
    return options.project;
  }
  return _.get(project, "resources.realtimeDatabaseInstance");
}
