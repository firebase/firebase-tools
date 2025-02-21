import * as apphosting from "../gcp/apphosting";
import { logger } from "../logger";
import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { logWarning } from "../utils";
import { FirebaseError } from "../error";

export const command = new Command("apphosting:builds:get <backendId> <buildId>")
  .description("get a build for an App Hosting backend")
  .before(apphosting.ensureApiEnabled)
  .action(async (backendId: string, buildId: string, options: Options) => {
    const projectId = needProjectId(options);
    const builds = await apphosting.listBuilds(projectId, /* location: */ "-", /* backendId */ "-");
    const matchingBuilds = builds.builds.filter((b) => {
      const parsedBuild = apphosting.parseBuildName(b.name);
      if (parsedBuild.backendId === backendId && parsedBuild.buildId === buildId) {
        return true;
      }
    });
    if (matchingBuilds.length > 0) {
      if (matchingBuilds.length > 1) {
        logWarning(
          `Detected multiple backends with same backendId (${backendId}) and buildId (${buildId}) within the same global location. ` +
            "Please delete and recreate any backends that share an ID with another. Use `apphosting:backends:list` to see all backends.",
        );
      }
      logger.info(JSON.stringify(matchingBuilds[0], null, 2));
      return matchingBuilds[0];
    }
    if (builds.unreachable && builds.unreachable.length !== 0) {
      logWarning(
        `Backends with the following primary regions are unreachable: ${builds.unreachable}.\n` +
          "If your backend is in one of these regions, please try again later.",
      );
    }
    throw new FirebaseError(`No build ${buildId} found for any backend ${backendId}.`);
  });
