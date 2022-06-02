import { Command } from "../command";
import { FirebaseError } from "../error";
import * as utils from "../utils";

import { fetchBuildtoolsJar, runBuildtoolsCommand } from "../crashlytics/buildToolsJarHelper";

interface CommandOptions {
  app: string | null;
  mappingFile: string | null;
  resourceFile: string | null;
  debug: boolean | null;
}

interface JarOptions {
  app: string;
  mappingFilePath: string;
  resourceFilePath: string;
}

export default new Command("crashlytics:mappingfile:upload <mappingFile>")
  .description("Upload a mapping file to deobfuscate stack traces.")
  .option("--app <appID>", "The app id of your Firebase app")
  .option(
    "--resource-file <resourceFile>",
    "Path to the Android resource XML file that includes the mapping file id."
  )
  .option("--debug", "print debug output and logging from the underlying uploader tool")
  .action(async (mappingFile: string, options: CommandOptions) => {
    const app = getGoogleAppID(options) || "";
    const debug = !!options.debug;
    if (!mappingFile) {
      throw new FirebaseError("set <mappingFile> to a valid mapping file path");
    }
    const mappingFilePath = mappingFile;
    const resourceFilePath = options.resourceFile ? options.resourceFile : "";

    const jarFile = await fetchBuildtoolsJar();
    const jarOptions: JarOptions = { app, mappingFilePath, resourceFilePath };

    utils.logBullet(`Uploading mapping file: ${mappingFilePath}`);
    const uploadArgs = buildArgs({ ...jarOptions });
    runBuildtoolsCommand(jarFile, uploadArgs, debug);
    utils.logBullet("Successfully uploaded mapping file");
  });

function getGoogleAppID(options: CommandOptions): string | null {
  if (!options.app) {
    throw new FirebaseError("Set the --app option to a valid Firebase app id and try again");
  }
  return options.app;
}

function buildArgs(options: JarOptions): string[] {
  return [
    "-uploadMappingFile",
    options.mappingFilePath,
    "-resourceFile",
    options.resourceFilePath,
    "-googleAppId",
    options.app,
    "-verbose",
  ];
}
