import fetch, { Response } from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { ChildProcess } from "child_process";

import { logger } from "../../../../logger";
import * as api from "../../../../api";
import * as build from "../../build";
import { Runtime } from "../supported";
import * as v1alpha1 from "./v1alpha1";
import { FirebaseError } from "../../../../error";

const TIMEOUT_OVERRIDE_ENV_VAR = "FUNCTIONS_DISCOVERY_TIMEOUT";

export function getFunctionDiscoveryTimeout(): number {
  return +(process.env[TIMEOUT_OVERRIDE_ENV_VAR] || 0) * 1000; /* ms */
}

/**
 * Converts the YAML retrieved from discovery into a Build object for param interpolation.
 */
export function yamlToBuild(
  yaml: any,
  project: string,
  region: string,
  runtime: Runtime,
): build.Build {
  try {
    if (!yaml.specVersion) {
      throw new FirebaseError("Expect manifest yaml to specify a version number");
    }
    if (yaml.specVersion === "v1alpha1") {
      return v1alpha1.buildFromV1Alpha1(yaml, project, region, runtime);
    }
    throw new FirebaseError(
      "It seems you are using a newer SDK than this version of the CLI can handle. Please update your CLI with `npm install -g firebase-tools`",
    );
  } catch (err: any) {
    throw new FirebaseError("Failed to parse build specification", { children: [err] });
  }
}

/**
 * Load a Build from a functions.yaml file.
 */
export async function detectFromYaml(
  directory: string,
  project: string,
  runtime: Runtime,
): Promise<build.Build | undefined> {
  let text: string;
  try {
    text = await fs.promises.readFile(path.join(directory, "functions.yaml"), "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      logger.debug("Could not find functions.yaml. Must use http discovery");
    } else {
      logger.debug("Unexpected error looking for functions.yaml file:", err);
    }
    return;
  }

  logger.debug("Found functions.yaml. Got spec:", text);
  const parsed = yaml.parse(text);
  return yamlToBuild(parsed, project, api.functionsDefaultRegion(), runtime);
}

/**
 * Load a build from a discovery service.
 */
export async function detectFromPort(
  port: number,
  project: string,
  runtime: Runtime,
  initialDelay = 0,
  timeout = 10_000 /* 10s to boot up */,
): Promise<build.Build> {
  let res: Response;
  const discoveryTimeout = getFunctionDiscoveryTimeout() || timeout;
  const timedOut = new Promise<never>((resolve, reject) => {
    setTimeout(() => {
      const originalError = "User code failed to load. Cannot determine backend specification.";
      const error = `${originalError} Timeout after ${discoveryTimeout}. See https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization'`;
      reject(new FirebaseError(error));
    }, discoveryTimeout);
  });

  // Initial delay to wait for admin server to boot.
  if (initialDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, initialDelay));
  }

  const url = `http://127.0.0.1:${port}/__/functions.yaml`;
  while (true) {
    try {
      res = await Promise.race([fetch(url), timedOut]);
      break;
    } catch (err: any) {
      if (
        err?.name === "FetchError" ||
        ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(err?.code)
      ) {
        continue;
      }
      throw err;
    }
  }

  if (res.status !== 200) {
    const text = await res.text();
    logger.debug(`Got response code ${res.status}; body ${text}`);
    throw new FirebaseError(
      "Functions codebase could not be analyzed successfully. " +
        "It may have a syntax or runtime error",
    );
  }
  const text = await res.text();
  logger.debug("Got response from /__/functions.yaml", text);

  let parsed: any;
  try {
    parsed = yaml.parse(text);
  } catch (err: any) {
    logger.debug("Failed to parse functions.yaml", err);
    throw new FirebaseError(`Failed to load function definition from source: ${text}`);
  }

  return yamlToBuild(parsed, project, api.functionsDefaultRegion(), runtime);
}

/**
 * Load a build by executing user code that writes a manifest file (dynamic file-based discovery).
 
 * The user code is expected to write functions.yaml to the path specified by FUNCTIONS_MANIFEST_OUTPUT_PATH.
 */
export async function detectFromOutputPath(
  childProcess: ChildProcess,
  manifestPath: string,
  project: string,
  runtime: Runtime,
  timeout = 10_000,
): Promise<build.Build> {
  return new Promise((resolve, reject) => {
    let stderrBuffer = "";
    let resolved = false;

    const discoveryTimeout = getFunctionDiscoveryTimeout() || timeout;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(
          new FirebaseError(
            `User code failed to load. Cannot determine backend specification. Timeout after ${discoveryTimeout}ms`,
          ),
        );
      }
    }, discoveryTimeout);

    childProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    childProcess.on("exit", async (code: number | null) => {
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;

        if (code !== 0 && code !== null) {
          const errorMessage = stderrBuffer.trim() ?? `Discovery process exited with code ${code}`;
          reject(
            new FirebaseError(
              `User code failed to load. Cannot determine backend specification.\n${errorMessage}`,
            ),
          );
        } else {
          try {
            const manifestContent = await fs.promises.readFile(manifestPath, "utf8");
            const parsed = yaml.parse(manifestContent);
            resolve(yamlToBuild(parsed, project, api.functionsDefaultRegion(), runtime));
          } catch (err: any) {
            if (err.code === "ENOENT") {
              reject(
                new FirebaseError(
                  `Discovery process completed but no function manifest was found at ${manifestPath}`,
                ),
              );
            } else {
              reject(new FirebaseError(`Failed to read or parse manifest file: ${err.message}`));
            }
          }
        }
      }
    });

    childProcess.on("error", (err: Error) => {
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
        reject(new FirebaseError(`Discovery process failed: ${err.message}`));
      }
    });
  });
}
