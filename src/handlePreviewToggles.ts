"use strict";

import { bold, red } from "colorette";

import * as experiments from "./experiments";

function errorOut(name?: string): void {
  console.log(`${bold(red("Error:"))} Did not recognize preview feature ${bold(name || "")}`);
  process.exit(1);
}

/**
 * Implement --open-sesame and --close-sesame
 */
export function handlePreviewToggles(args: string[]): boolean {
  const name = args[1];
  const isValid = experiments.isValidExperiment(name);
  if (args[0] === "--open-sesame") {
    console.log(
      `${bold("firebase --open-sesame")} is deprecated and wil be removed in a future ` +
        `version. Use the new "experiments" family of commands, including ${bold(
          "firebase experiments:enable",
        )}`,
    );
    if (isValid) {
      console.log(`Enabling experiment ${bold(name)} ...`);
      experiments.setEnabled(name, true);
      experiments.flushToDisk();
      console.log("Experiment enabled!");
      return process.exit(0);
    }

    errorOut(name);
  } else if (args[0] === "--close-sesame") {
    console.log(
      `${bold("firebase --open-sesame")} is deprecated and wil be removed in a future ` +
        `version. Use the new "experiments" family of commands, including ${bold(
          "firebase experiments:disable",
        )}`,
    );
    if (isValid) {
      console.log(`Disabling experiment ${bold(name)}...`);
      experiments.setEnabled(name, false);
      experiments.flushToDisk();
      return process.exit(0);
    }

    errorOut(name);
  }
  return false;
}
