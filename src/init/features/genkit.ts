import * as spawn from "cross-spawn";
import { logger } from "../../logger";
import { doSetup as functionsSetup } from "./functions";
import { Options } from "../../options";
import { Config } from "../../config";
import { prompt } from "../../prompt";

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
  }

  const projectDir: string = `${config.projectDir}/${setup.functions.source}`;

  try {
    await wrapSpawn("npm", ["install", "genkit", "--save-dev"], projectDir);
    await wrapSpawn("npx", ["genkit", "init", "-p", "firebase"], projectDir);
  } catch (e) {
    logger.error("Genkit initialization failed...");
    return;
  }

  logger.info("To use the Genkit CLI, run:");
  logger.info("    npm install genkit -g");
}

function wrapSpawn(cmd: string, args: string[], projectDir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installer = spawn(cmd, args, {
      cwd: projectDir,
      stdio: "inherit",
    });

    installer.on("error", (err: any) => {
      logger.debug(err.stack);
    });

    installer.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }
      logger.info();
      logger.error("NPM install failed, halting with Firebase initialization...");
      return reject();
    });
  });
}
