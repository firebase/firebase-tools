/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */

import { isIPv4 } from "net";
import { checkListenable } from "../portUtils";
import { detectPackageManager, detectPackageManagerStartCommand } from "./developmentServer";
import { DEFAULT_HOST, DEFAULT_PORTS } from "../constants";
import { spawnWithCommandString } from "../../init/spawn";
import { logger } from "./developmentServer";
import { Emulators } from "../types";
import { getLocalAppHostingConfiguration } from "./config";
import { resolveProjectPath } from "../../projectPath";
import { EmulatorRegistry } from "../registry";
import { setEnvVarsForEmulators } from "../env";
import { FirebaseError } from "../../error";
import { loadSecret } from "../../apphosting/secrets/index";
import { logLabeledWarning } from "../../utils";
import * as apphosting from "../../gcp/apphosting";
import { Constants } from "../constants";
import { constructDefaultWebSetup, WebConfig } from "../../fetchWebSetup";
import { spawnSync } from "child_process";
import { gte as semverGte } from "semver";
import { getAutoinitEnvVars } from "../../apphosting/utils";
import { AppPlatform, getAppConfig } from "../../management/apps";

interface StartOptions {
  projectId?: string;
  backendId?: string;
  port?: number;
  startCommand?: string;
  rootDirectory?: string;
}

// Matches `--port 5004`, `--port=5004`, `-p 5004` or `-p '5004'` as a standalone flag and captures
// the number. Skips values that aren't a plain port, like `$PORT` or `-p 8080:80`.
const START_COMMAND_PORT_REGEX = /(?:^|\s)(?:--port|-p)(?:=|\s+)["']?(\d+)(?![\d:])/;

/**
 * Spins up a project locally by running the project's dev command.
 *
 * Assumptions:
 *  - Dev server runs on "localhost" when the package manager's dev command is
 *    run
 *  - Dev server will respect the PORT environment variable
 *    - This is not the case for Angular. When an `ng serve`
 *       custom command is detected, we add --port <PORT> instead.
 */
export async function start(options?: StartOptions): Promise<{ hostname: string; port: number }> {
  const hostname = DEFAULT_HOST;
  let port = options?.port ?? DEFAULT_PORTS.apphosting;
  while (!(await availablePort(hostname, port))) {
    port += 1;
  }

  const backendRoot = resolveProjectPath({}, options?.rootDirectory ?? "./");

  let startCommand;
  if (options?.startCommand) {
    startCommand = options?.startCommand;
    // A port set in the start command is the emulator port (see getListenConfig in ../controller),
    // unless `firebase.json#emulators.apphosting.port` sets a different one.
    const startCommandPort = getStartCommandPort(startCommand);
    if (startCommandPort !== undefined && startCommandPort !== port) {
      throw new FirebaseError(
        `The start command sets port ${startCommandPort}, but the emulator uses port ${port} (\`firebase.json#emulators.apphosting.port\`). Set them to the same port.`,
      );
    }
    // Angular below v22 does not respect the NodeJS.ProcessEnv.PORT set below. Port needs to be
    // set directly in the CLI, unless the start command already does.
    if (startCommand.includes("ng serve") && !startCommand.includes("--port")) {
      startCommand += ` --port ${port}`;
    }
    logger.logLabeled(
      "BULLET",
      Emulators.APPHOSTING,
      `running custom start command: '${startCommand}'`,
    );
  } else {
    // TODO: port may be specified in an underlying command. But we will need to parse the package.json
    // file to be sure.
    startCommand = await detectPackageManagerStartCommand(backendRoot);
    logger.logLabeled("BULLET", Emulators.APPHOSTING, `starting app with: '${startCommand}'`);
  }

  const packageManager = await detectPackageManager(backendRoot).catch(() => undefined);
  let autoinitEnvVars: Record<string, string> = {};
  if (packageManager === "pnpm") {
    // TODO(jamesdaniels) look into pnpm support for autoinit
    logLabeledWarning("apphosting", "Firebase JS SDK autoinit does not currently support PNPM.");
  } else {
    const webappConfig = await getBackendAppConfig(options?.projectId, options?.backendId);
    autoinitEnvVars = getAutoinitEnvVars(webappConfig);
  }

  const apphostingLocalConfig = await getLocalAppHostingConfiguration(backendRoot);
  const resolveEnv = Object.entries(apphostingLocalConfig.env).map(async ([key, value]) => [
    key,
    value.value ? value.value : await loadSecret(options?.projectId, value.secret!),
  ]);

  const environmentVariablesToInject: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    // autoinitEnvVars serve as fallback defaults.
    ...autoinitEnvVars,
    // Emulator variables take precedence over auto-init.
    ...getEmulatorEnvs(),
    // User-defined variables from apphosting.<env>.yaml take highest precedence.
    ...Object.fromEntries(await Promise.all(resolveEnv)),
    FIREBASE_APP_HOSTING: "1",
    X_GOOGLE_TARGET_PLATFORM: "fah",
    GCLOUD_PROJECT: options?.projectId,
    PROJECT_ID: options?.projectId,
    PORT: port.toString(),
  };

  if (packageManager !== "pnpm") {
    await tripFirebasePostinstall(backendRoot, environmentVariablesToInject);
  }

  // NOTE: Development server should not block main emulator process.
  spawnWithCommandString(startCommand, backendRoot, environmentVariablesToInject)
    .catch((err) => {
      logger.logLabeled("ERROR", Emulators.APPHOSTING, `failed to start Dev Server: ${err}`);
    })
    .then(() => logger.logLabeled("BULLET", Emulators.APPHOSTING, `Dev Server stopped`));

  return { hostname, port };
}

/**
 * The port a start command sets with `--port` or `-p`, if it is a plain number.
 */
export function getStartCommandPort(startCommand: string): number | undefined {
  const match = START_COMMAND_PORT_REGEX.exec(startCommand);
  return match ? Number(match[1]) : undefined;
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

type Dependency = {
  name: string;
  version: string;
  path: string;
  dependencies?: Record<string, Dependency>;
};

async function tripFirebasePostinstall(
  rootDirectory: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const npmLs = spawnSync("npm", ["ls", "@firebase/util", "--json", "--long"], {
    cwd: rootDirectory,
    shell: process.platform === "win32",
  });
  if (!npmLs.stdout) {
    return;
  }
  const npmLsResults = JSON.parse(npmLs.stdout.toString().trim());
  const dependenciesToSearch: Dependency[] = Object.values(npmLsResults.dependencies || {});
  const firebaseUtilPaths: string[] = [];
  for (const dependency of dependenciesToSearch) {
    if (
      dependency.name === "@firebase/util" &&
      semverGte(dependency.version, "1.11.0") &&
      firebaseUtilPaths.indexOf(dependency.path) === -1
    ) {
      firebaseUtilPaths.push(dependency.path);
    }
    if (dependency.dependencies) {
      dependenciesToSearch.push(...Object.values(dependency.dependencies));
    }
  }

  await Promise.all(
    firebaseUtilPaths.map(
      (path) =>
        new Promise<void>((resolve) => {
          spawnSync("npm", ["run", "postinstall"], {
            cwd: path,
            env,
            stdio: "ignore",
            shell: process.platform === "win32",
          });
          resolve();
        }),
    ),
  );
}

async function getBackendAppConfig(
  projectId?: string,
  backendId?: string,
): Promise<WebConfig | undefined> {
  if (!projectId) {
    return undefined;
  }

  if (Constants.isDemoProject(projectId)) {
    return constructDefaultWebSetup(projectId);
  }

  if (!backendId) {
    return undefined;
  }

  const backendsList = await apphosting.listBackends(projectId, "-").catch(() => undefined);
  const backend = backendsList?.backends.find(
    (b) => apphosting.parseBackendName(b.name).id === backendId,
  );

  if (!backend) {
    logLabeledWarning(
      "apphosting",
      `Unable to lookup details for backend ${backendId}. Firebase SDK autoinit will not be available.`,
    );
    return undefined;
  }

  if (!backend.appId) {
    return undefined;
  }

  return (await getAppConfig(backend.appId, AppPlatform.WEB)) as WebConfig;
}
