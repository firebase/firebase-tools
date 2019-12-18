import * as childProcess from "child_process";
import { StdioOptions } from "child_process";
import * as clc from "cli-color";

import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { FirebaseError } from "../error";
import * as utils from "../utils";
import * as logger from "../logger";
import * as controller from "../emulator/controller";
import { DatabaseEmulator } from "../emulator/databaseEmulator";
import { EmulatorRegistry } from "../emulator/registry";
import { FirestoreEmulator } from "../emulator/firestoreEmulator";
import * as commandUtils from "../emulator/commandUtils";
import * as getProjectId from "../getProjectId";

async function runScript(script: string, extraEnv: Record<string, string>): Promise<number> {
  utils.logBullet(`Running script: ${clc.bold(script)}`);

  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };

  const databaseInstance = EmulatorRegistry.get(Emulators.DATABASE);
  if (databaseInstance) {
    const info = databaseInstance.getInfo();
    const address = `${info.host}:${info.port}`;
    env[DatabaseEmulator.DATABASE_EMULATOR_ENV] = address;
  }

  const firestoreInstance = EmulatorRegistry.get(Emulators.FIRESTORE);
  if (firestoreInstance) {
    const info = firestoreInstance.getInfo();
    const address = `${info.host}:${info.port}`;

    env[FirestoreEmulator.FIRESTORE_EMULATOR_ENV] = address;
    env[FirestoreEmulator.FIRESTORE_EMULATOR_ENV_ALT] = address;
  }

  const proc = childProcess.spawn(script, {
    stdio: ["inherit", "inherit", "inherit"] as StdioOptions,
    shell: true,
    windowsHide: true,
    env,
  });

  logger.debug(`Running ${script} with environment ${JSON.stringify(env)}`);

  return new Promise((resolve, reject) => {
    proc.on("error", (err: any) => {
      utils.logWarning(`There was an error running the script: ${JSON.stringify(err)}`);
      reject();
    });

    // Due to the async nature of the node child_process library, sometimes
    // we can get the "exit" callback before all "data" has been read from
    // from the script's output streams. To make the logs look cleaner, we
    // add a short delay before resolving/rejecting this promise after an
    // exit.
    const exitDelayMs = 500;
    proc.once("exit", (code, signal) => {
      if (signal) {
        utils.logWarning(`Script exited with signal: ${signal}`);
        setTimeout(reject, exitDelayMs);
        return;
      }

      const exitCode = code || 0;
      if (code === 0) {
        utils.logSuccess(`Script exited successfully (code 0)`);
      } else {
        utils.logWarning(`Script exited unsuccessfully (code ${code})`);
      }

      setTimeout(() => {
        resolve(exitCode);
      }, exitDelayMs);
    });
  });
}

module.exports = new Command("emulators:exec <script>")
  .before(commandUtils.beforeEmulatorCommand)
  .description(
    "start the local Firebase emulators, " + "run a test script, then shut down the emulators"
  )
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .action(async (script: string, options: any) => {
    const projectId = getProjectId(options, true);
    const extraEnv: Record<string, string> = {};
    if (projectId) {
      extraEnv.GCLOUD_PROJECT = projectId;
    }
    let exitCode = 0;
    try {
      await controller.startAll(options);
      exitCode = await runScript(script, extraEnv);
    } catch (e) {
      logger.debug("Error in emulators:exec", e);
      throw e;
    } finally {
      await controller.cleanShutdown();
    }

    if (exitCode !== 0) {
      throw new FirebaseError(`Script "${clc.bold(script)}" exited with code ${exitCode}`, {
        exit: exitCode,
      });
    }
  });
