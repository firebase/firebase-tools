import * as rcExperiment from "../remoteconfig/listexperiments";
import {
  DEFAULT_PAGE_SIZE,
  ListExperimentOptions,
  ListExperimentsResult,
  NAMESPACE_FIREBASE,
} from "../remoteconfig/interfaces";
import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";

export const command = new Command("remoteconfig:experiments:list")
  .description("get a list of Remote Config experiments")
  .option(
    "--pageSize <pageSize>",
    "Maximum number of experiments to return per page. Defaults to 10. Pass '0' to fetch all experiments",
  )
  .option(
    "--pageToken <pageToken>",
    "Token from a previous list operation to retrieve the next page of results. Listing starts from the beginning if omitted.",
  )
  .option(
    "--filter <filter>",
    "Filters experiments by their full resource name. Format: `name:projects/{project_number}/namespaces/{namespace}/experiments/{experiment_id}`",
  )
  .before(requireAuth)
  .before(requirePermissions, [
    "firebaseabt.experiments.list",
    "firebaseanalytics.resources.googleAnalyticsReadAndAnalyze",
  ])
  .action(async (options: Options) => {
    const projectNumber = await needProjectNumber(options);
    const listExperimentOptions: ListExperimentOptions = {
      pageSize: (options.pageSize as string) ?? DEFAULT_PAGE_SIZE,
      pageToken: options.pageToken as string,
      filter: options.filter as string,
    };
    const { experiments, nextPageToken }: ListExperimentsResult =
      await rcExperiment.listExperiments(projectNumber, NAMESPACE_FIREBASE, listExperimentOptions);
    logger.info(rcExperiment.parseExperimentList(experiments ?? []));
    if (nextPageToken) {
      logger.info(`\nNext Page Token: \x1b[32m${nextPageToken}\x1b[0m\n`);
    }
    return {
      experiments,
      nextPageToken,
    };
  });
