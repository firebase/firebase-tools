import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { migrate } from "../firebase_studio/migrate";
import * as path from "path";
import * as experiments from "../experiments";

export const command = new Command("studio:export [path]")
  .description("export Firebase Studio apps for migration to Antigravity")
  .action(async (exportPath: string | undefined, options: Options) => {
    experiments.assertEnabled("studioexport", "export Studio apps");
    const rootPath = path.resolve(exportPath || options.cwd || process.cwd());
    logger.info(`Exporting Studio apps from ${rootPath} to Antigravity...`);
    await migrate(rootPath);
  });
