import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import {
  ListRollouts,
  NAMESPACE_FIREBASE,
  ListRolloutOptions,
  DEFAULT_PAGE_SIZE,
} from "../remoteconfig/interfaces";
import * as rcRollout from "../remoteconfig/rolloutlist";
import { FirebaseError } from "../error";

export const command = new Command("remoteconfig:rollouts:list")
  .description("get a list of Remote Config rollouts")
  .option(
    "--pageSize <pageSize>",
    "the maximum number of rollouts to return per page. If no `pageToken` is specified, results begin from the first rollout",
  )
  .option(
    "--pageToken <pageToken>",
    "a token from a previous list operation, used to retrieve the next page of results. If omitted, the listing starts from the beginning.",
  )
  .option(
    "--filter <filter>",
    "filters rollouts by their full resource name. Format: `name:projects/{project_id}/namespaces/{namespace}/rollouts/{rollout_id}`",
  )
  .before(requireAuth)
  .before(requirePermissions, [
    "cloud.configs.get",
    "firebaseanalytics.resources.googleAnalyticsReadAndAnalyze",
  ])
  .action(async (options: Options) => {
    if (options.pageSize && isNaN(parseInt(options.pageSize as string))) {
      throw new FirebaseError("Page size must be a number.");
    }
    const projectId = await needProjectNumber(options);
    const listRolloutOptions: ListRolloutOptions = {
      pageSize: (options.pageSize as string) ?? DEFAULT_PAGE_SIZE,
      pageToken: options.pageToken as string,
      filter: options.filter as string,
    };
    const { rollouts, nextPageToken }: ListRollouts = await rcRollout.listRollout(
      projectId,
      NAMESPACE_FIREBASE,
      listRolloutOptions,
    );
    if (rollouts && rollouts.length > 0) {
      logger.info(rcRollout.parseRolloutList(rollouts));
    } else {
      logger.info("No rollouts found.");
    }
    if (nextPageToken) {
      logger.info(`\nNext Page Token: \x1b[32m${nextPageToken}\x1b[0m\n`);
    }
    return {
      rollouts,
      nextPageToken,
    };
  });
