import { Command } from "../command";
import * as utils from "../utils";

import { fetchBuildtoolsJar, runBuildtoolsCommand } from "../crashlytics/buildToolsJarHelper";
import { Options } from "../options";

interface CommandOptions extends Options {
  resourceFile?: string;
}

interface JarOptions {
  resourceFilePath: string;
}

export default new Command("crashlytics:mappingfile:generateid")
  .description(
    "generate a mapping file id and write it to an Android resource file, which will be built into the app"
  )
  .option(
    "--resource-file <resourceFile>",
    "Path to the Android resource XML file that will be created or updated."
  )
  .option("--debug", "print debug output and logging")
  .action(async (options: CommandOptions) => {
    const debug = !!options.debug;
    // :TODO: check for validity?
    const resourceFilePath = options.resourceFile ? options.resourceFile : "";
    const jarFile = await fetchBuildtoolsJar();
    const jarOptions: JarOptions = { resourceFilePath };

    utils.logBullet(`Updating resource file: ${resourceFilePath}`);
    const uploadArgs = buildArgs(jarOptions);
    runBuildtoolsCommand(jarFile, uploadArgs, debug);
    utils.logBullet("Successfully updated mapping file id");
  });

function buildArgs(options: JarOptions): string[] {
  return ["-injectMappingFileIdIntoResource", options.resourceFilePath, "-verbose"];
}
