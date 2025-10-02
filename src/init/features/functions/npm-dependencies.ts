import { logger } from "../../../logger";
import { confirm } from "../../../prompt";
import { wrapSpawn } from "../../spawn";

export async function askInstallDependencies(setup: any, config: any): Promise<void> {
  setup.npm = await confirm({
    message: "Do you want to install dependencies with npm now?",
    default: true,
  });
  if (setup.npm) {
    try {
      await wrapSpawn("npm", ["install"], config.projectDir + `/${setup.source}`);
    } catch (e) {
      logger.info();
      logger.error("NPM install failed, continuing with Firebase initialization...");
    }
  }
}
