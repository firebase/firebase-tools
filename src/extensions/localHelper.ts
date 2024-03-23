import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";

import { fileExistsSync } from "../fsutils";
import { FirebaseError } from "../error";
import { ExtensionSpec } from "./types";
import { logger } from "../logger";

export const EXTENSIONS_SPEC_FILE = "extension.yaml";
const EXTENSIONS_PREINSTALL_FILE = "PREINSTALL.md";

/**
 * Retrieves and parses an ExtensionSpec from a local directory
 * @param directory the directory to look for extension.yaml and PRESINSTALL.md in
 */
export async function getLocalExtensionSpec(directory: string): Promise<ExtensionSpec> {
  const spec = await parseYAML(readFile(path.resolve(directory, EXTENSIONS_SPEC_FILE)));
  try {
    const preinstall = readFile(path.resolve(directory, EXTENSIONS_PREINSTALL_FILE));
    spec.preinstallContent = preinstall;
  } catch (err: any) {
    logger.debug(`No PREINSTALL.md found in directory ${directory}.`);
  }
  return spec;
}

/**
 * Climbs directories loking for an extension.yaml file, and return the first
 * directory that contains one. Throws an error if none is found.
 * @param directory the directory to start from searching from.
 */
export function findExtensionYaml(directory: string): string {
  while (!fileExistsSync(path.resolve(directory, EXTENSIONS_SPEC_FILE))) {
    const parentDir = path.dirname(directory);
    if (parentDir === directory) {
      throw new FirebaseError(
        "Couldn't find an extension.yaml file. Check that you are in the root directory of your extension.",
      );
    }
    directory = parentDir;
  }
  return directory;
}

/**
 * Retrieves a file from the directory.
 * @param directory the directory containing the file
 * @param file the name of the file
 */
export function readFile(pathToFile: string): string {
  try {
    return fs.readFileSync(pathToFile, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FirebaseError(`Could not find "${pathToFile}""`, { original: err });
    }
    throw new FirebaseError(`Failed to read file at "${pathToFile}"`, { original: err });
  }
}

/**
 * Checks if an extension name is a local extension by checking if a directory exists at that location
 * @param extensionName an extension name to check
 */
export function isLocalExtension(extensionName: string): boolean {
  try {
    fs.readdirSync(extensionName);
  } catch (err: any) {
    return false;
  }
  return true;
}

/**
 * Wraps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 * @param source an unparsed YAML string
 */
function parseYAML(source: string): any {
  try {
    return yaml.safeLoad(source);
  } catch (err: any) {
    if (err instanceof yaml.YAMLException) {
      throw new FirebaseError(`YAML Error: ${err.message}`, { original: err });
    }
    throw new FirebaseError(err.message);
  }
}
