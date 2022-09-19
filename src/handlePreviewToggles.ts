"use strict";

import * as clc from "colorette";

import * as experiments from "./experiments";

function errorOut(name?: string): void {
  console.log(
    `${clc.bold(clc.red("Error:"))} Did not recognize preview feature ${clc.bold(name || "")}`
  );
  process.exit(1);
}

/**
 * Implement --open-sesame and --close-sesame
 */
export function handlePreviewToggles(args: string[]): boolean {
  const name = args[1];
  const isValid = experiments.isValidExperiment(name);
  if (args[0] === "--open-sesame") {
    if (isValid) {
      console.log(`Enabling preview feature ${clc.bold(name)} ...`);
      experiments.setEnabled(name, true);
      experiments.flushToDisk();
      console.log("Preview feature enabled!");
      return process.exit(0);
    }

    errorOut();
  } else if (args[0] === "--close-sesame") {
    if (isValid) {
      console.log(`Disabling preview feature ${clc.bold(name)}...`);
      experiments.setEnabled(name, false);
      experiments.flushToDisk();
      return process.exit(0);
    }

    errorOut();
  }
  return false;
}
