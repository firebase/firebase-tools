import { Command } from "../command";
import { FirebaseError } from "../error";
import * as utils from "../utils";

import { fetchBuildtoolsJar, runBuildtoolsCommand } from "../crashlytics/buildToolsJarHelper";
import { Options } from "../options";

interface CommandOptions extends Options {
  app?: string;
  mappingFile?: string;
  resourceFile?: string;
}

interface JarOptions {
  app: string;
  mappingFilePath: string;
  resourceFilePath: string;
}

export const command = new Command("crashlytics:mappingfile:upload <mappingFile>")
  .description("upload a ProGuard/R8-compatible mapping file to deobfuscate stack traces")
  .option("--app <appID>", "the app id of your Firebase app")
  .option(
    "--resource-file <resourceFile>",
    "path to the Android resource XML file that includes the mapping file id",
  )
  .action(async (mappingFile: string, options: CommandOptions) => {
    const app = getGoogleAppID(options);
    const debug = !!options.debug;
    if (!mappingFile) {
      throw new FirebaseError(
        "set `--mapping-file <mappingFile>` to a valid mapping file path, e.g. app/build/outputs/mapping.txt",
      );
    }
    const mappingFilePath = mappingFile;

    const resourceFilePath = options.resourceFile;
    if (!resourceFilePath) {
      throw new FirebaseError(
        "set --resource-file <resourceFile> to a valid Android resource file path, e.g. app/main/res/values/strings.xml",
      );
    }

    const jarFile = await fetchBuildtoolsJar();
    const jarOptions: JarOptions = { app, mappingFilePath, resourceFilePath };

    utils.logBullet(`Uploading mapping file: ${mappingFilePath}`);
    const uploadArgs = buildArgs(jarOptions);
    runBuildtoolsCommand(jarFile, uploadArgs, debug);
    utils.logBullet("Successfully uploaded mapping file");
  });

function getGoogleAppID(options: CommandOptions): string {
  if (!options.app) {
    throw new FirebaseError(
      "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
    );
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
