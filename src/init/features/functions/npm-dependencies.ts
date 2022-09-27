import * as spawn from "cross-spawn";

import { logger } from "../../../logger";
import { prompt } from "../../../prompt";

export function askInstallDependencies(setup: any, config: any): Promise<void> {
  return prompt(setup, [
    {
      name: "npm",
      type: "confirm",
      message: "Do you want to install dependencies with npm now?",
      default: true,
    },
  ]).then(() => {
    if (setup.npm) {
      return new Promise<void>((resolve) => {
        const installer = spawn("npm", ["install"], {
          cwd: config.projectDir + `/${setup.source}`,
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
          logger.error("NPM install failed, continuing with Firebase initialization...");
          return resolve();
        });
      });
    }
  });
}
