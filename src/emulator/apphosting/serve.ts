/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */

import { isIPv4 } from "net";
import { checkListenable } from "../portUtils";
import { discoverPackageManager } from "./utils";
import { DEFAULT_HOST, DEFAULT_PORTS } from "../constants";
import { spawnWithCommandString, wrapSpawn } from "../../init/spawn";
import { getLocalAppHostingConfiguration } from "./config";
import { logger } from "./utils";
import { Emulators } from "../types";

interface StartOptions {
  customStartCommand?: string;
}

/**
 * Spins up a project locally by running the project's dev command.
 *
 * Assumptions:
 *  - Dev server runs on "localhost" when the package manager's dev command is
 *    run
 *  - Dev server will respect the PORT environment variable
 */
export async function start(options?: StartOptions): Promise<{ hostname: string; port: number }> {
  const hostname = DEFAULT_HOST;
  let port = DEFAULT_PORTS.apphosting;
  while (!(await availablePort(hostname, port))) {
    port += 1;
  }

  serve(port, options?.customStartCommand);

  return { hostname, port };
}

async function serve(port: number, customStartCommand?: string): Promise<void> {
  const rootDir = process.cwd();
  const apphostingLocalConfig = await getLocalAppHostingConfiguration(rootDir);
  const environmentVariablesToInject = {
    ...apphostingLocalConfig.environmentVariables,
    PORT: port.toString(),
  };

  if (customStartCommand) {
    logger.logLabeled(
      "BULLET",
      Emulators.APPHOSTING,
      `running custom start command: '${customStartCommand}'`,
    );
    await spawnWithCommandString(customStartCommand, rootDir, environmentVariablesToInject);
    return;
  }

  const packageManager = await discoverPackageManager(rootDir);
  await wrapSpawn(packageManager, ["run", "dev"], rootDir, environmentVariablesToInject);
}

function availablePort(host: string, port: number): Promise<boolean> {
  return checkListenable({
    address: host,
    port,
    family: isIPv4(host) ? "IPv4" : "IPv6",
  });
}
