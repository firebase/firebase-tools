import { bold } from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { logger } from "../logger";
import { last } from "../utils";

export const command = new Command("experiments:describe <experiment>")
  .description("describe what an experiment does when enabled")
  .action((experiment: string) => {
    if (!experiments.isValidExperiment(experiment)) {
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
    }

    const spec = experiments.ALL_EXPERIMENTS[experiment];
    logger.info(`${bold("Name")}: ${experiment}`);
    logger.info(`${bold("Enabled")}: ${experiments.isEnabled(experiment) ? "yes" : "no"}`);
    if (spec.docsUri) {
      logger.info(`${bold("Documentation")}: ${spec.docsUri}`);
    }
    logger.info(`${bold("Description")}: ${spec.fullDescription || spec.shortDescription}`);
  });
