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
import * as rcRollout from "../remoteconfig/listRollouts";
import { FirebaseError } from "../error";

export const command = new Command("remoteconfig:rollouts:list")
  .description("get a list of Remote Config rollouts.")
  .option(
    "--pageSize <pageSize>",
    "Maximum number of rollouts to return per page. Defaults to 10. Pass '0' to fetch all rollouts",
  )
  .option(
    "--pageToken <pageToken>",
    "Token from a previous list operation to retrieve the next page of results. Listing starts from the beginning if omitted.",
  )
  .option(
    "--filter <filter>",
    "Filters rollouts by their full resource name. Format: `name:projects/{project_id}/namespaces/{namespace}/rollouts/{rollout_id}`",
  )
  .before(requireAuth)
  .before(requirePermissions, [
    "cloud.configs.get",
    "firebaseanalytics.resources.googleAnalyticsReadAndAnalyze",
  ])
  .action(async (options: Options) => {
    const projectNumber = await needProjectNumber(options);
    const listRolloutOptions: ListRolloutOptions = {
      pageSize: (options.pageSize as string) ?? DEFAULT_PAGE_SIZE,
      pageToken: options.pageToken as string,
      filter: options.filter as string,
    };
    const { rollouts, nextPageToken }: ListRollouts = await rcRollout.listRollout(
      projectNumber,
      NAMESPACE_FIREBASE,
      listRolloutOptions,
    );
    logger.info(rcRollout.parseRolloutList(rollouts ?? []));
    if (nextPageToken) {
      logger.info(`\nNext Page Token: \x1b[32m${nextPageToken}\x1b[0m\n`);
    }
    return {
      rollouts,
      nextPageToken,
    };
  });
