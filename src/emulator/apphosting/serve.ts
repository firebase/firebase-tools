/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */

import { isIPv4 } from "net";
import * as clc from "colorette";
import { checkListenable } from "../portUtils";
import { detectStartCommand } from "./developmentServer";
import { DEFAULT_HOST, DEFAULT_PORTS } from "../constants";
import { spawnWithCommandString } from "../../init/spawn";
import { logger } from "./developmentServer";
import { Emulators } from "../types";
import { getLocalAppHostingConfiguration } from "./config";
import { resolveProjectPath } from "../../projectPath";
import { EmulatorRegistry } from "../registry";
import { setEnvVarsForEmulators } from "../env";
import { FirebaseError } from "../../error";
import * as secrets from "../../gcp/secretManager";
import { logLabeledError } from "../../utils";

interface StartOptions {
  projectId?: string;
  port?: number;
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
  let port = options?.port ?? DEFAULT_PORTS.apphosting;
  while (!(await availablePort(hostname, port))) {
    port += 1;
  }

  await serve(options?.projectId, port, options?.startCommand, options?.rootDirectory);

  return { hostname, port };
}

// Matches a fully qualified secret or version name, e.g.
// projects/my-project/secrets/my-secret/versions/1
// projects/my-project/secrets/my-secret/versions/latest
// projects/my-project/secrets/my-secret
const secretResourceRegex =
  /^projects\/([^/]+)\/secrets\/([^/]+)(?:\/versions\/((?:latest)|\d+))?$/;

// Matches a shorthand for a project-relative secret, with optional version, e.g.
// my-secret
// my-secret@1
// my-secret@latest
const secretShorthandRegex = /^([^/@]+)(?:@((?:latest)|\d+))?$/;

async function loadSecret(project: string | undefined, name: string): Promise<string> {
  let projectId: string;
  let secretId: string;
  let version: string;
  const match = secretResourceRegex.exec(name);
  if (match) {
    projectId = match[1];
    secretId = match[2];
    version = match[3] || "latest";
  } else {
    const match = secretShorthandRegex.exec(name);
    if (!match) {
      throw new FirebaseError(`Invalid secret name: ${name}`);
    }
    if (!project) {
      throw new FirebaseError(
        `Cannot load secret ${match[1]} without a project. ` +
          `Please use ${clc.bold("firebase use")} or pass the --project flag.`,
      );
    }
    projectId = project;
    secretId = match[1];
    version = match[2] || "latest";
  }
  try {
    return await secrets.accessSecretVersion(projectId, secretId, version);
  } catch (err: any) {
    if (err?.original?.code === 403 || err?.original?.context?.response?.statusCode === 403) {
      logLabeledError(
        Emulators.APPHOSTING,
        `Permission denied to access secret ${secretId}. Use ` +
          `${clc.bold("firebase apphosting:secrets:grantaccess")} to get permissions.`,
      );
    }
    throw err;
  }
}

/**
 * Runs the development server in a child process.
 */
async function serve(
  projectId: string | undefined,
  port: number,
  startCommand?: string,
  backendRelativeDir?: string,
): Promise<void> {
  backendRelativeDir = backendRelativeDir ?? "./";

  const backendRoot = resolveProjectPath({}, backendRelativeDir);
  const apphostingLocalConfig = await getLocalAppHostingConfiguration(backendRoot);
  const resolveEnv = Object.entries(apphostingLocalConfig.env).map(async ([key, value]) => [
    key,
    value.value ? value.value : await loadSecret(projectId, value.secret!),
  ]);

  const environmentVariablesToInject = {
    ...getEmulatorEnvs(),
    ...Object.fromEntries(await Promise.all(resolveEnv)),
    PORT: port.toString(),
  };
  if (startCommand) {
    logger.logLabeled(
      "BULLET",
      Emulators.APPHOSTING,
      `running custom start command: '${startCommand}'`,
    );

    // NOTE: Development server should not block main emulator process.
    spawnWithCommandString(startCommand, backendRoot, environmentVariablesToInject)
      .catch((err) => {
        logger.logLabeled("ERROR", Emulators.APPHOSTING, `failed to start Dev Server: ${err}`);
      })
      .then(() => logger.logLabeled("BULLET", Emulators.APPHOSTING, `Dev Server stopped`));
    return;
  }

  const detectedStartCommand = await detectStartCommand(backendRoot);
  logger.logLabeled("BULLET", Emulators.APPHOSTING, `starting app with: '${detectedStartCommand}'`);

  // NOTE: Development server should not block main emulator process.
  spawnWithCommandString(detectedStartCommand, backendRoot, environmentVariablesToInject)
    .catch((err) => {
      logger.logLabeled("ERROR", Emulators.APPHOSTING, `failed to start Dev Server: ${err}`);
    })
    .then(() => logger.logLabeled("BULLET", Emulators.APPHOSTING, `Dev Server stopped`));
}

function availablePort(host: string, port: number): Promise<boolean> {
  return checkListenable({
    address: host,
    port,
    family: isIPv4(host) ? "IPv4" : "IPv6",
  });
}

/**
 * Exported for unit tests
 */
export function getEmulatorEnvs(): Record<string, string> {
  const envs: Record<string, string> = {};
  const emulatorInfos = EmulatorRegistry.listRunningWithInfo().filter(
    (emulator) => emulator.name !== Emulators.APPHOSTING, // No need to set envs for the apphosting emulator itself.
  );
  setEnvVarsForEmulators(envs, emulatorInfos);

  return envs;
}
