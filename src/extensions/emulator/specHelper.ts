import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as path from "path";
import * as fs from "fs-extra";

import { ExtensionSpec, Resource } from "../extensionsApi";
import { FirebaseError } from "../../error";
import { substituteParams } from "../extensionsHelper";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { Emulators } from "../../emulator/types";

const SPEC_FILE = "extension.yaml";
const validFunctionTypes = [
  "firebaseextensions.v1beta.function",
  "firebaseextensions.v1beta.scheduledFunction",
];

/**
 * Wrapps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 */
function wrappedSafeLoad(source: string): any {
  try {
    return yaml.safeLoad(source);
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      throw new FirebaseError(`YAML Error: ${err.message}`, { original: err });
    }
    throw err;
  }
}

/**
 * Reads an extension.yaml and parses its contents into an ExtensionSpec.
 * @param directory the directory to look for a extensionYaml in.
 */
export async function readExtensionYaml(directory: string): Promise<ExtensionSpec> {
  const extensionYaml = await readFileFromDirectory(directory, SPEC_FILE);
  const source = extensionYaml.source;
  return wrappedSafeLoad(source);
}

/**
 * Retrieves a file from the directory.
 */
export function readFileFromDirectory(
  directory: string,
  file: string
): Promise<{ [key: string]: any }> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(path.resolve(directory, file), "utf8", (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          return reject(
            new FirebaseError(`Could not find "${file}" in "${directory}"`, { original: err })
          );
        }
        reject(
          new FirebaseError(`Failed to read file "${file}" in "${directory}"`, { original: err })
        );
      } else {
        resolve(data);
      }
    });
  }).then((source) => {
    return {
      source,
      sourceDirectory: directory,
    };
  });
}

export function getFunctionResourcesWithParamSubstitution(
  extensionSpec: ExtensionSpec,
  params: { [key: string]: string }
): object[] {
  const rawResources = extensionSpec.resources.filter((resource) =>
    validFunctionTypes.includes(resource.type)
  );
  return substituteParams(rawResources, params);
}

export function getFunctionProperties(resources: Resource[]) {
  return resources.map((r) => r.properties);
}

/**
 * Choses a node version to use based on the 'nodeVersion' field in resources.
 * Currently, the emulator will use 1 node version for all functions, even though
 * an extension can specify different node versions for each function when deployed.
 * For now, we choose the newest version that a user lists in their function resources,
 * and fall back to node 8 if none is listed.
 */
export function getNodeVersion(resources: Resource[]): string {
  const functionNamesWithoutRuntime: string[] = [];
  const versions = resources.map((r: Resource) => {
    if (_.includes(r.type, "function")) {
      if (r.properties?.runtime) {
        return r.properties?.runtime;
      } else {
        functionNamesWithoutRuntime.push(r.name);
      }
    }
    return "nodejs8";
  });

  if (functionNamesWithoutRuntime.length) {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
      "WARN",
      "extensions",
      `No 'runtime' property found for the following functions, defaulting to nodejs8: ${functionNamesWithoutRuntime.join(
        ", "
      )}`
    );
  }
  const invalidRuntimes = _.filter(versions, (v) => {
    return !_.includes(v, "nodejs");
  });

  if (invalidRuntimes.length) {
    throw new FirebaseError(
      `The following runtimes are not supported by the Emulator Suite: ${invalidRuntimes.join(
        ", "
      )}. \n Only Node runtimes are supported.`
    );
  }
  if (_.includes(versions, "nodejs10")) {
    return "10";
  }
  if (_.includes(versions, "nodejs6")) {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
      "WARN",
      "extensions",
      "Node 6 is deprecated. We recommend upgrading to a newer version."
    );
    return "6";
  }
  return "8";
}
