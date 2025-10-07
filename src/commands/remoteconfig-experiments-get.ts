import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { needProjectNumber } from "../projectUtils";
import { GetExperimentResult, NAMESPACE_FIREBASE } from "../remoteconfig/interfaces";
import * as rcExperiment from "../remoteconfig/getExperiment";
import { RemoteConfigOptions } from "../remoteconfig/options"; // 👈 Import the new interface


export const command = new Command("remoteconfig:experiments:get <experimentId>")
  .description("get a Remote Config experiment.")
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
