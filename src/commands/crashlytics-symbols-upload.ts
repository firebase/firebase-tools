import * as os from "os";
import * as path from "path";
import * as uuid from "uuid";

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as utils from "../utils";

import { fetchBuildtoolsJar, runBuildtoolsCommand } from "../crashlytics/buildToolsJarHelper";
import { Options } from "../options";

enum SymbolGenerator {
  breakpad = "breakpad",
  csym = "csym",
}

interface CommandOptions extends Options {
  app?: string;
  generator?: SymbolGenerator;
  dryRun?: boolean;
}

interface JarOptions {
  app: string;
  generator: SymbolGenerator;
  cachePath: string;
  symbolFile: string;
  generate: boolean;
}

const SYMBOL_CACHE_ROOT_DIR = process.env.FIREBASE_CRASHLYTICS_CACHE_PATH || os.tmpdir();

export const command = new Command("crashlytics:symbols:upload <symbolFiles...>")
  .description("upload symbols for native code, to symbolicate stack traces")
  .option("--app <appID>", "the app id of your Firebase app")
  .option("--generator [breakpad|csym]", "the symbol generator being used, default is breakpad")
  .option("--dry-run", "generate symbols without uploading them")
  .action(async (symbolFiles: string[], options: CommandOptions) => {
    const app = getGoogleAppID(options);
    const generator = getSymbolGenerator(options);
    const dryRun = !!options.dryRun;
    const debug = !!options.debug;

    const jarFile = await fetchBuildtoolsJar();

    const jarOptions: JarOptions = {
      app,
      generator,
      cachePath: path.join(
        SYMBOL_CACHE_ROOT_DIR,
        `crashlytics-${uuid.v4()}`,
        "nativeSymbols",
        // Windows does not allow ":" in their directory names
        app.replace(/:/g, "-"),
        generator,
      ),
      symbolFile: "",
      generate: true,
    };

    for (const symbolFile of symbolFiles) {
      utils.logBullet(`Generating symbols for ${symbolFile}`);
      const generateArgs = buildArgs({ ...jarOptions, symbolFile });
      runBuildtoolsCommand(jarFile, generateArgs, debug);
      utils.logBullet(`Generated symbols for ${symbolFile}`);
      utils.logBullet(`Output Path: ${jarOptions.cachePath}`);
    }

    if (dryRun) {
      utils.logBullet("Skipping upload because --dry-run was passed");
      return;
    }

    utils.logBullet(`Uploading all generated symbols...`);
    const uploadArgs = buildArgs({ ...jarOptions, generate: false });
    runBuildtoolsCommand(jarFile, uploadArgs, debug);
    utils.logBullet("Successfully uploaded all symbols");
  });

function getGoogleAppID(options: CommandOptions): string {
  if (!options.app) {
    throw new FirebaseError(
      "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
    );
  }
  return options.app;
}

function getSymbolGenerator(options: CommandOptions): SymbolGenerator {
  // Default to using BreakPad symbols
  if (!options.generator) {
    return SymbolGenerator.breakpad;
  }
  if (!Object.values(SymbolGenerator).includes(options.generator)) {
    throw new FirebaseError('--symbol-generator should be set to either "breakpad" or "csym"');
  }
  return options.generator;
}

function buildArgs(options: JarOptions): string[] {
  const baseArgs = [
    "-symbolGenerator",
    options.generator,
    "-symbolFileCacheDir",
    options.cachePath,
    "-verbose",
  ];

  if (options.generate) {
    return baseArgs.concat(["-generateNativeSymbols", "-unstrippedLibrary", options.symbolFile]);
  }

  return baseArgs.concat(["-uploadNativeSymbols", "-googleAppId", options.app]);
}
