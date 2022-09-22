import { bold } from "colorette";

import { Command } from "../command";
import * as experiments from "../experiments";
import { logger } from "../logger";

export const command = new Command("experiments:disable [experiment]")
  .description("disable an experiment on this machine")
  .action((experiment: string) => {
    if (experiments.isValidExperiment(experiment)) {
      experiments.setEnabled(experiment, false);
      experiments.flushToDisk();
      logger.info(`Disabled experiment ${bold(experiment)}`);
      return;
    }

    logger.error(`Cannot find experiment ${bold(experiment)}`);
    const potentials = experiments.experimentNameAutocorrect(experiment)!;
    if (potentials.length === 1) {
      logger.error(`Did you mean ${potentials[0]}?`);
    } else if (potentials.length) {
      logger.error(
        `Did you mean ${potentials.slice(0, -1).join(",")} or ${potentials[potentials.length - 1]}?`
      );
    }
  });
