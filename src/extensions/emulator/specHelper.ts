import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as path from "path";
import * as fs from "fs-extra";

import { fileExistsSync } from "../../fsutils";
import { ExtensionSpec, Resource, Param } from "../extensionsApi";
import { FirebaseError } from "../../error";
import { substituteParams } from "./paramHelper";

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
 * Climbs directories loking for an extension.yaml file, and return the first
 * directory that contains one. Throws an error if none is found.
 * @param directory the directory to start from searching from.
 */
export async function findExtensionYaml(directory: string): Promise<string> {
  while (!fileExistsSync(path.resolve(directory, SPEC_FILE))) {
    const parentDir = path.dirname(directory);
    if (parentDir === directory) {
      throw new FirebaseError(
        "Couldn't find an extension.yaml file. Check that you are in the root directory of your extension."
      );
    }
    directory = parentDir;
  }
  return directory;
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
export async function readFileFromDirectory(
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
