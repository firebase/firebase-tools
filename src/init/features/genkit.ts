import * as fs from 'fs';
import * as spawn from "cross-spawn";
import { logger } from "../../logger";
import { detectProjectRoot } from "../../detectProjectRoot";

const PACKAGE_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/genkit/package.json",
  "utf8",
);

/**
 * doSetup is the entry point for setting up the genkit suite.
 * 
 * @param config configuration object for this init
 */
export async function doSetup(_: any, config: any): Promise<void> {
  const projectDir: string = config.projectDir;

  try {
    detectProjectRoot({cwd: projectDir, configPath: 'package.json'});
  } catch (e) {
    await config.askWriteProjectFile('package.json', PACKAGE_TEMPLATE);
  }

  try {
    await wrapSpawn("npm", ["install", "genkit", "--save-dev"], projectDir);
    await wrapSpawn("npx", ["genkit", "init", "-p", "firebase"], projectDir);
  } catch (e) {
    logger.error("Genkit initialization failed...");
    return;
  }
  
  logger.info("To use the Genkit CLI, run:");
  logger.info("    npm install genkit -g");
}

function wrapSpawn(
    cmd: string,
    args:
    string[], projectDir:
    string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installer = spawn(cmd, args, {
      cwd: projectDir,
      stdio: "inherit",
    });

    installer.on("error", (err: any) => {
      logger.debug(err.stack);
    });

    installer.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }
      logger.info();
      logger.error("NPM install failed, halting with Firebase initialization...");
      return reject();
    });
  });
}
