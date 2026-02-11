/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */

import { isIPv4 } from "net";
import * as clc from "colorette";
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
import * as secrets from "../../gcp/secretManager";
import { logLabeledError, logLabeledWarning } from "../../utils";
import * as apphosting from "../../gcp/apphosting";
import { Constants } from "../constants";
import { constructDefaultWebSetup, WebConfig } from "../../fetchWebSetup";
import { AppPlatform, getAppConfig } from "../../management/apps";
import { spawnSync } from "child_process";
import { gte as semverGte } from "semver";

interface StartOptions {
  projectId?: string;
  backendId?: string;
  port?: number;
  startCommand?: string;
  rootDirectory?: string;
  portFixed?: boolean;
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

function parsePortFromCommand(command: string): number | undefined {
  const portRegex = /--port\s+(\d+)|-p\s+(\d+)/;
  const match = portRegex.exec(command);
  if (match) {
    return parseInt(match[1] || match[2], 10);
  }
  return undefined;
}

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

  // App Hosting emulator not yet support multiple backends, so we don't need to check for port conflicts
  // with other App Hosting emulators on the same machine.
  if (!options?.portFixed) {
    while (!(await availablePort(hostname, port))) {
      port += 1;
    }
  }

  const backendRoot = resolveProjectPath({}, options?.rootDirectory ?? "./");

  let startCommand;
  if (options?.startCommand) {
    startCommand = options?.startCommand;
    const parsedPort = parsePortFromCommand(startCommand);

    if (parsedPort) {
      if (options?.portFixed && options?.port && options.port !== parsedPort) {
        throw new FirebaseError(
          `Port ${parsedPort} specified in start command conflicts with port ${options.port} specified in firebase.json or via CLI flags.`,
        );
      }
      // If we found a port in the command, use it.
      port = parsedPort;
      logger.logLabeled(
        "BULLET",
        Emulators.APPHOSTING,
        `Using port ${port} from start command: '${startCommand}'`,
      );
    } else {
      // Angular does not respect the NodeJS.ProcessEnv.PORT set below. Port needs to be
      // set directly in the CLI.
      if (startCommand.includes("ng serve")) {
        startCommand += ` --port ${port}`;
      }
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

  const apphostingLocalConfig = await getLocalAppHostingConfiguration(backendRoot);
  const resolveEnv = Object.entries(apphostingLocalConfig.env).map(async ([key, value]) => [
    key,
    value.value ? value.value : await loadSecret(options?.projectId, value.secret!),
  ]);

  const environmentVariablesToInject: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ...getEmulatorEnvs(),
    ...Object.fromEntries(await Promise.all(resolveEnv)),
    FIREBASE_APP_HOSTING: "1",
    X_GOOGLE_TARGET_PLATFORM: "fah",
    GCLOUD_PROJECT: options?.projectId,
    PROJECT_ID: options?.projectId,
    PORT: port.toString(),
  };

  const packageManager = await detectPackageManager(backendRoot).catch(() => undefined);
  if (packageManager === "pnpm") {
    // TODO(jamesdaniels) look into pnpm support for autoinit
    logLabeledWarning("apphosting", `Firebase JS SDK autoinit does not currently support PNPM.`);
  } else {
    const webappConfig = await getBackendAppConfig(options?.projectId, options?.backendId);
    if (webappConfig) {
      environmentVariablesToInject["FIREBASE_WEBAPP_CONFIG"] ||= JSON.stringify(webappConfig);
      environmentVariablesToInject["FIREBASE_CONFIG"] ||= JSON.stringify({
        databaseURL: webappConfig.databaseURL,
        storageBucket: webappConfig.storageBucket,
        projectId: webappConfig.projectId,
      });
    }
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
      !firebaseUtilPaths.includes(dependency.path)
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
