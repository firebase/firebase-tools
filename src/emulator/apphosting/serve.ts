/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */

import { isIPv4 } from "net";
import { checkListenable } from "../portUtils";
import { discoverPackageManager } from "./utils";
import { DEFAULT_HOST, DEFAULT_PORTS } from "../constants";
import { spawnWithCommandString, wrapSpawn } from "../../init/spawn";
import { logger } from "./utils";
import { Emulators } from "../types";
import { getLocalAppHostingConfiguration } from "./config";
import { resolveProjectPath } from "../../projectPath";

interface StartOptions {
  startCommand?: string;
  rootDirectory?: string;
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

  serve(port, options?.startCommand, options?.rootDirectory);

  return { hostname, port };
}

async function serve(
  port: number,
  startCommand?: string,
  backendRelativeDir?: string,
): Promise<void> {
  backendRelativeDir = backendRelativeDir ?? "./";

  const backendRoot = resolveProjectPath({}, backendRelativeDir);
  const apphostingLocalConfig = await getLocalAppHostingConfiguration(backendRoot);
  const environmentVariablesAsRecord: Record<string, string> = {};

  for (const env of apphostingLocalConfig.environmentVariables) {
    environmentVariablesAsRecord[env.variable] = env.value!;
  }

  const environmentVariablesToInject = {
    ...environmentVariablesAsRecord,
    PORT: port.toString(),
  };

  if (startCommand) {
    logger.logLabeled(
      "BULLET",
      Emulators.APPHOSTING,
      `running custom start command: '${startCommand}'`,
    );
    await spawnWithCommandString(startCommand, backendRoot, environmentVariablesToInject);
    return;
  }

  const packageManager = await discoverPackageManager(backendRoot);

  logger.logLabeled(
    "BULLET",
    Emulators.APPHOSTING,
    `starting app with: '${packageManager} run dev'`,
  );
  await wrapSpawn(packageManager, ["run", "dev"], backendRoot, environmentVariablesToInject);
}

function availablePort(host: string, port: number): Promise<boolean> {
  return checkListenable({
    address: host,
    port,
    family: isIPv4(host) ? "IPv4" : "IPv6",
  });
}
