import { bold } from "colorette";

import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import * as experiments from "../experiments.js";
import { logger } from "../logger.js";
import { last } from "../utils.js";

export const command = new Command("experiments:enable <experiment>")
  .description("enable an experiment on this machine")
  .action((experiment: string) => {
    if (experiments.isValidExperiment(experiment)) {
      experiments.setEnabled(experiment, true);
      experiments.flushToDisk();
      logger.info(`Enabled experiment ${bold(experiment)}`);
      return;
    }

    let message = `Cannot find experiment ${bold(experiment)}`;
    const potentials = experiments.experimentNameAutocorrect(experiment);
    if (potentials.length === 1) {
      message = `${message}\nDid you mean ${potentials[0]}?`;
    } else if (potentials.length) {
      message = `${message}\nDid you mean ${potentials.slice(0, -1).join(",")} or ${last(
        potentials,
      )}?`;
    }
    throw new FirebaseError(message);
  });
