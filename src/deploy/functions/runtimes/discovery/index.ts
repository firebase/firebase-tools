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

// How long to wait between polls of the admin server. A tight loop competes for
// CPU with the very process we are waiting on, which on constrained machines is
// enough to cause the timeout it is meant to detect.
const RETRY_DELAY_MS = 100;

// A bare value at or above this is almost certainly milliseconds. The variable is
// documented in seconds, so 30000 means 8.3 hours, which silently disables the
// timeout rather than extending it.
const SUSPICIOUS_SECONDS = 600;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The discovery timeout override, in ms, or 0 if unset.
 *
 * A bare number is read as seconds for backwards compatibility. An explicit "s"
 * or "ms" suffix is also accepted, because the bare form is a common source of
 * off-by-1000 mistakes.
 */
export function getFunctionDiscoveryTimeout(): number {
  const raw = process.env[TIMEOUT_OVERRIDE_ENV_VAR]?.trim();
  if (!raw) {
    return 0;
  }

  const match = /^(\d+(?:\.\d+)?)\s*(ms|s)?$/i.exec(raw);
  if (!match) {
    logger.warn(
      `Ignoring ${TIMEOUT_OVERRIDE_ENV_VAR}="${raw}": expected a number of seconds, e.g. 60 or 60s.`,
    );
    return 0;
  }

  const value = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  if (unit === "ms") {
    return value;
  }

  if (value >= SUSPICIOUS_SECONDS) {
    logger.warn(
      `${TIMEOUT_OVERRIDE_ENV_VAR}=${raw} is being read as ${value} seconds ` +
        `(${(value / 3600).toFixed(1)} hours). If you meant milliseconds, write ${raw}ms.`,
    );
  }
  return value * 1000;
}

/**
 * The timeout message, which has to carry its own instructions: by the time a
 * user sees it they have no other signal that a timeout is what happened.
 */
function timeoutMessage(timeoutMs: number): string {
  return (
    `User code failed to load. Cannot determine backend specification. ` +
    `Timed out after ${timeoutMs / 1000}s. ` +
    `If your code is slow to load, set ${TIMEOUT_OVERRIDE_ENV_VAR} to allow more time ` +
    `(in seconds, e.g. ${TIMEOUT_OVERRIDE_ENV_VAR}=60). ` +
    `See https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization`
  );
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
  serverExited?: Promise<never>,
): Promise<build.Build> {
  let res: Response;
  const discoveryTimeout = getFunctionDiscoveryTimeout() || timeout;
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new FirebaseError(timeoutMessage(discoveryTimeout)));
    }, discoveryTimeout);
  });

  // A connection refused is ambiguous: the server may still be booting, or it may
  // have died and never be coming back. Racing its exit lets us report the crash
  // instead of blaming a timeout for it.
  const abort: Promise<never>[] = serverExited ? [timedOut, serverExited] : [timedOut];

  try {
    // Initial delay to wait for admin server to boot.
    if (initialDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, initialDelay));
    }

    const url = `http://127.0.0.1:${port}/__/functions.yaml`;
    while (true) {
      try {
        res = await Promise.race([fetch(url), ...abort]);
        break;
      } catch (err: any) {
        const realErr = err?.cause || err;
        if (
          err?.name === "FetchError" ||
          realErr?.name === "FetchError" ||
          ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(realErr?.code)
        ) {
          await Promise.race([sleep(RETRY_DELAY_MS), ...abort]);
          continue;
        }
        throw err;
      }
    }
  } finally {
    clearTimeout(timer);
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
        reject(new FirebaseError(timeoutMessage(discoveryTimeout)));
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
