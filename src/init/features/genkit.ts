import { logger } from "../../logger";
import { doSetup as functionsSetup } from "./functions";
import { Options } from "../../options";
import { Config } from "../../config";
import { prompt } from "../../prompt";
import { wrapSpawn } from "../spawn";

/**
 * doSetup is the entry point for setting up the genkit suite.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<void> {
  if (setup.functions?.languageChoice !== "typescript") {
    await prompt(setup, [
      {
        name: "continueFunctions",
        type: "confirm",
        message:
          "Genkit with Firebase uses Cloud Functions for Firebase with TypeScript. Initialize Functions to continue?",
        default: true,
      },
    ]);
    if (!setup.continueFunctions) {
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

  try {
    logger.info("Installing Genkit CLI");
    await wrapSpawn("npm", ["install", "genkit", "--save-dev"], projectDir);
    await wrapSpawn("npx", ["genkit", "init", "-p", "firebase"], projectDir);
  } catch (e) {
    logger.error("Genkit initialization failed...");
    return;
  }

  logger.info("To use the Genkit CLI globally, run:");
  logger.info("    npm install genkit -g");
}
