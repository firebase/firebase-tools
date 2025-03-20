import fetch, { Response } from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { promisify } from "util";

import { logger } from "../../../../logger";
import * as api from "../../.../../../../api";
import * as build from "../../build";
import { Runtime } from "../supported";
import * as v1alpha1 from "./v1alpha1";
import { FirebaseError } from "../../../../error";

export const readFileAsync = promisify(fs.readFile);

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
    text = await exports.readFileAsync(path.join(directory, "functions.yaml"), "utf8");
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
  const timedOut = new Promise<never>((resolve, reject) => {
    setTimeout(() => {
      const originalError = "User code failed to load. Cannot determine backend specification.";
      const error = `${originalError} Timeout after ${timeout}. See https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization'`;
      reject(new FirebaseError(error));
    }, getFunctionDiscoveryTimeout() || timeout);
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
