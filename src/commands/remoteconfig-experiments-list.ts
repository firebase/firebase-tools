import * as rcExperiment from "../remoteconfig/listexperiments";
import { ListExperimentsResult, NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { FirebaseError } from "../error";

export const command = new Command("remoteconfig:experiments:list")
  .description("get a list of Remote Config experiments")
  .option(
    "--pageSize <pageSize>",
    "the maximum number of experiments to return per page. If no `pageToken` is specified, results begin from the first experiment",
  )
  .option(
    "--pageToken <pageToken>",
    "a token from a previous list operation, used to retrieve the next page of results. If omitted, the listing starts from the beginning.",
  )
  .option(
    "--filter <filter>",
    "filters experiments by their full resource name. Required format: `name:projects/{project_number}/namespaces/{namespace}/experiments/{experiment_id}`",
  )
  .before(requireAuth)
  .before(requirePermissions, ["firebaseabt.experiments.list", "firebaseanalytics.resources.googleAnalyticsReadAndAnalyze"])
  .action(async (options: Options) => {
    if (options.pageSize && isNaN(parseInt(options.pageSize as string))) {
      throw new FirebaseError("Page size must be a number.");
    }
    const projectNumber = await needProjectNumber(options);
    const { experiments, nextPageToken }: ListExperimentsResult = await rcExperiment.listExperiments(
      projectNumber,
      NAMESPACE_FIREBASE,
      options.pageToken as string | undefined,
      options.pageSize as string | undefined,
      options.filter as string | undefined
    );
    logger.info(rcExperiment.parseExperimentList(experiments));
    if (nextPageToken) {
      logger.info(`\nNext Page Token: \x1b[32m${nextPageToken}\x1b[0m\n`);
    }
    return {
      experiments,
      nextPageToken
    };
  });
