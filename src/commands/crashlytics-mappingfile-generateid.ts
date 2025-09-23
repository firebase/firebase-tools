import { Command } from "../command";
import * as utils from "../utils";

import { fetchBuildtoolsJar, runBuildtoolsCommand } from "../crashlytics/buildToolsJarHelper";
import { Options } from "../options";
import { FirebaseError } from "../error";

interface CommandOptions extends Options {
  resourceFile: string;
}

interface JarOptions {
  resourceFilePath: string;
}

export const command = new Command("crashlytics:mappingfile:generateid")
  .description(
    "generate a mapping file id and write it to an Android resource file, which will be built into the app",
  )
  .option(
    "--resource-file <resourceFile>",
    "path to the Android resource XML file that will be created or updated.",
  )
  .action(async (options: CommandOptions) => {
    const debug = !!options.debug;
    // Input errors will be caught in the buildtools jar.
    const resourceFilePath = options.resourceFile;
    if (!resourceFilePath) {
      throw new FirebaseError(
        "set --resource-file <resourceFile> to an Android resource file path, e.g. app/src/main/res/values/crashlytics.xml",
      );
    }
    const jarFile = await fetchBuildtoolsJar();
    const jarOptions: JarOptions = { resourceFilePath };

    utils.logBullet(`Updating resource file: ${resourceFilePath}`);
    const generateIdArgs = buildArgs(jarOptions);
    runBuildtoolsCommand(jarFile, generateIdArgs, debug);
    utils.logBullet("Successfully updated mapping file id");
  });

function buildArgs(options: JarOptions): string[] {
  return ["-injectMappingFileIdIntoResource", options.resourceFilePath, "-verbose"];
}
