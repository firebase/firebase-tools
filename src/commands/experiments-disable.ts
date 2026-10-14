import { bold } from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { logger } from "../logger";
import { last } from "../utils";

export const command = new Command("experiments:disable <experiment>")
  .description("disable an experiment on this machine")
  .action((experiment: string) => {
    if (experiments.isValidExperiment(experiment)) {
      experiments.setEnabled(experiment, false);
      experiments.flushToDisk();
      logger.info(`Disabled experiment ${bold(experiment)}`);
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
