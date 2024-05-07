import { logger } from "../../logger";
import { doSetup as functionsSetup } from "./functions";
import { Options } from "../../options";
import { Config } from "../../config";
import { promptOnce } from "../../prompt";
import { wrapSpawn } from "../spawn";

/**
 * doSetup is the entry point for setting up the genkit suite.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<void> {
  if (setup.functions?.languageChoice !== "typescript") {
    const continueFunctions = await promptOnce({
      type: "confirm",
      message:
        "Genkit's Firebase integration uses Cloud Functions for Firebase with TypeScript. Initialize Functions to continue?",
      default: true,
    });
    if (!continueFunctions) {
      logger.info("Stopped Genkit initialization");
      return;
    }

    // Functions with genkit should always be typescript
    setup.languageOverride = "typescript";
    await functionsSetup(setup, config, options);
    delete setup.languageOverride;
    logger.info();
  }

  const projectDir: string = `${config.projectDir}/${setup.functions.source}`;

  const installType = await promptOnce({
    type: "list",
    message: "Install the Genkit CLI globally or locally in this project?",
    choices: [
      { name: "Globally", value: "globally" },
      { name: "Just this project", value: "project" },
    ],
  });

  try {
    logger.info("Installing Genkit CLI");
    if (installType === "globally") {
      await wrapSpawn("npm", ["install", "-g", "genkit"], projectDir);
      await wrapSpawn("genkit", ["init", "-p", "firebase"], projectDir);
      logger.info("Start the Genkit developer experience by running:");
      logger.info(`    cd ${setup.functions.source} && genkit start`);
    } else {
      await wrapSpawn("npm", ["install", "genkit", "--save-dev"], projectDir);
      await wrapSpawn("npx", ["genkit", "init", "-p", "firebase"], projectDir);
      logger.info("Start the Genkit developer experience by running:");
      logger.info(`    cd ${setup.functions.source} && npx genkit start`);
    }
  } catch (e) {
    logger.error("Genkit initialization failed...");
    return;
  }
}
