import { Command } from "../command";
import { logger } from "../logger";
import * as experiments from "../experiments";

export const command = new Command("studio:export")
  .description("export Firebase Studio apps for migration to Antigravity")
  .action(() => {
    experiments.assertEnabled("studioexport", "export Studio apps");
    logger.info("Exporting Studio apps to Antigravity...");
    // TODO: implement export logic
  });
