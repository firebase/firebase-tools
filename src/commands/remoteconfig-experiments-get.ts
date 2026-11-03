import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { GetExperimentResult, NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcExperiment from "../remoteconfig/getExperiment";
import { RemoteConfigOptions } from "../remoteconfig/options"; // 👈 Import the new interface

export const command = new Command("remoteconfig:experiments:get <experimentId>")
  .description(
    "get a Remote Config experiment by ID and print its display name, service, objectives, " +
      "variants (name and weight), state (PENDING, RUNNING, DONE, or EXPIRED), timestamps, and etag " +
      "(use --json for the full experiment, including its description)",
  )
  .before(requireAuth)
  .before(requirePermissions, ["firebaseabt.experiments.get"])
  .action(async (experimentId: string, options: RemoteConfigOptions) => {
    const projectNumber: string = await needProjectNumber(options);
    const experiment: GetExperimentResult = await rcExperiment.getExperiment(
      projectNumber,
      NAMESPACE_FIREBASE,
      experimentId,
    );
    logger.info(rcExperiment.parseExperiment(experiment));
    return experiment;
  });
