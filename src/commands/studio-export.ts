import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { migrate } from "../firebase_studio/migrate";
import * as path from "path";
import * as experiments from "../experiments";
import { FirebaseError } from "../error";

export const command = new Command("studio:export <path>")
  .description(
    "Bootstrap Firebase Studio apps for migration to Antigravity. Run on the unzipped folder from the Firebase Studio download.",
  )
  .option("--no-start-agy", "skip starting the Antigravity IDE after migration")
  .action(async (exportPath: string, options: Options) => {
    experiments.assertEnabled("studioexport", "export Studio apps");
    if (!exportPath) {
      throw new FirebaseError("Must specify a path for migration.", { exit: 1 });
    }
    const rootPath = path.resolve(exportPath);
    logger.info(`Exporting Studio apps from ${rootPath} to Antigravity...`);
    await migrate(rootPath, { noStartAgy: !options.startAgy });
  });
