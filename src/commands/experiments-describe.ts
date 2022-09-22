import { bold } from "colorette";

import { Command } from "../command";
import * as experiments from "../experiments";
import { logger } from "../logger";

export const command = new Command("experiments:describe [experiment]")
  .description("enable an experiment on this machine")
  .action((experiment: string) => {
    if (!experiments.isValidExperiment(experiment)) {
      logger.error(`Cannot find experiment ${bold(experiment)}`);
      const potentials = experiments.experimentNameAutocorrect(experiment)!;
      if (potentials.length === 1) {
        logger.error(`Did you mean ${potentials[0]}?`);
      } else if (potentials.length) {
        logger.error(
          `Did you mean ${potentials.slice(0, -1).join(",")} or ${
            potentials[potentials.length - 1]
          }?`
        );
      }
      return;
    }

    const spec = experiments.ALL_EXPERIMENTS[experiment];
    logger.info(`${bold("Name")}: ${experiment}`);
    logger.info(`${bold("Enabled")}: ${experiments.isEnabled(experiment) ? "yes" : "no"}`);
    if (spec.docsUri) {
      logger.info(`${bold("Documentation")}: ${spec.docsUri}`);
    }
    logger.info(`${bold("Description")}: ${spec.fullDescription || spec.shortDescription}`);
  });
