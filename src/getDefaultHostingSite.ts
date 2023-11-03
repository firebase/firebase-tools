import { FirebaseError } from "./error";
import { isEnabled } from "./experiments";
import { SiteType, listSites } from "./hosting/api";
import { logger } from "./logger";
import { getFirebaseProject } from "./management/projects";
import { needProjectId } from "./projectUtils";
import { last } from "./utils";

export const errNoDefaultSite = new FirebaseError(
  "Could not determine the default site for the project."
);

/**
 * Tries to determine the default hosting site for a project, else falls back to projectId.
 * @param options The command-line options object
 * @return The hosting site ID
 */
export async function getDefaultHostingSite(options: any): Promise<string> {
  const projectId = needProjectId(options);
  const project = await getFirebaseProject(projectId);
  let site = project.resources?.hostingSite;
  if (!site) {
    if (isEnabled("deferredhosting")) {
      logger.debug(`the default site does not exist on the Firebase project; asking Hosting.`);
      const sites = await listSites(projectId);
      for (const s of sites) {
        if (s.type === SiteType.DEFAULT_SITE) {
          site = last(s.name.split("/"));
          break;
        }
      }
      if (!site) {
        throw errNoDefaultSite;
      }
      return site;
    }

    logger.debug(
      `No default hosting site found for project: ${options.project}. Using projectId as hosting site name.`
    );
    return options.project;
  }
  return site;
}
