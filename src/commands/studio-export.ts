import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { migrate, MigrateOptions } from "../firebase_studio/migrate";
import * as path from "path";
import { FirebaseError } from "../error";
import { unzip } from "../unzip";
import * as fs from "fs";

export const command = new Command("studio:export [path]")
  .description(
    "Bootstrap Firebase Studio apps for migration to Antigravity. Run on the unzipped folder from the Firebase Studio download, or directly on the downloaded zip file.",
  )
  .option("--no-start-antigravity", "skip starting the Antigravity IDE after migration")
  .action(async (exportPath: string, options: Options) => {
    if (!exportPath) {
      throw new FirebaseError(
        "Must specify the path to the Firebase Studio downloaded zip file or the unzipped folder path.",
        { exit: 1 },
      );
    }

    let rootPath = path.resolve(exportPath);

    if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile() && rootPath.endsWith(".zip")) {
      logger.info(`⏳ Unzipping ${rootPath}...`);
      const parsedPath = path.parse(rootPath);
      let extractDirName = parsedPath.name;
      if (!extractDirName || extractDirName === ".") {
        extractDirName = "studio-export";
      }
      const extractPath = path.join(parsedPath.dir, extractDirName);
      await unzip(rootPath, extractPath);

      // Studio exports usually contain a single top-level directory.
      // E.g., `Export-12345/`. Let's check if we should dive into it
      const extractedItems = fs.readdirSync(extractPath);
      if (
        extractedItems.length === 1 &&
        fs.statSync(path.join(extractPath, extractedItems[0])).isDirectory()
      ) {
        rootPath = path.join(extractPath, extractedItems[0]);
      } else {
        rootPath = extractPath;
      }
    }

    logger.info(`⏳ Exporting Studio app from ${rootPath} to Antigravity...`);
    await migrate(rootPath, options as MigrateOptions);
  });
