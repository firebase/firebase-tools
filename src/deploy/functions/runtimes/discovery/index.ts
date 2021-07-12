import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { promisify } from "util";

import { logger } from "../../../../logger";
import * as api from "../../.../../../../api";
import * as backend from "../../backend";
import * as runtimes from "..";
import * as v1alpha1 from "./v1alpha1";
import { FirebaseError } from "../../../../error";

export const readFileAsync = promisify(fs.readFile);

export function yamlToBackend(
  yaml: any,
  project: string,
  region: string,
  runtime: runtimes.Runtime
): backend.Backend {
  try {
    if (!yaml.specVersion) {
      throw new FirebaseError("Expect backend yaml to specify a version number");
    }
    if (yaml.specVersion === "v1alpha1") {
      return v1alpha1.backendFromV1Alpha1(yaml, project, region, runtime);
    }
    throw new FirebaseError(
      "It seems you are using a newer SDK than this version of the CLI can handle. Please update your CLI with `npm install -g firebase-tools`"
    );
  } catch (err) {
    throw new FirebaseError("Failed to parse backend specification", { children: [err] });
  }
}

export async function detectFromYaml(
  directory: string,
  project: string,
  runtime: runtimes.Runtime
): Promise<backend.Backend | undefined> {
  let text: string;
  try {
    text = await exports.readFileAsync(path.join(directory, "backend.yaml"), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      logger.debug("Could not find backend.yaml. Must use http discovery");
    } else {
      logger.debug("Unexpected error looking for backend.yaml file:", err);
    }
    return;
  }

  logger.debug("Found backend.yaml. Got spec:", text);
  const parsed = yaml.load(text);
  return yamlToBackend(parsed, project, api.functionsDefaultRegion, runtime);
}

export async function detectFromPort(
  port: number,
  project: string,
  runtime: runtimes.Runtime,
  timeout: number = 30_000 /* 30s to boot up */
): Promise<backend.Backend> {
  // The result type of fetch isn't exported
  let res: { text(): Promise<string> };
  const timedOut = new Promise<never>((resolve, reject) => {
    setTimeout(() => {
      reject(new FirebaseError("User code failed to load. Cannot determine backend specification"));
    }, timeout);
  });

  while (true) {
    try {
      res = await Promise.race([fetch(`http://localhost:${port}/backend.yaml`), timedOut]);
      break;
    } catch (err) {
      // Allow us to wait until the server is listening.
      if (err?.code === "ECONNREFUSED") {
        continue;
      }
      throw err;
    }
  }

  const text = await res.text();
  logger.debug("Got response from /backend.yaml", text);

  let parsed: any;
  try {
    parsed = yaml.load(text);
  } catch (err) {
    throw new FirebaseError("Failed to parse backend specification", { children: [err] });
  }

  return yamlToBackend(parsed, project, api.functionsDefaultRegion, runtime);
}
