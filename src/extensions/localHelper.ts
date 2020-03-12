import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";

import { FirebaseError } from "../error";
import { ExtensionSpec } from "./extensionsApi";
import * as logger from "../logger";

const EXTENSIONS_SPEC_FILE = "extension.yaml";
const EXTENSIONS_PREINSTALL_FILE = "PREINSTALL.md";

/**
 * Retrieves and parses an ExtensionSpec from a local directory
 * @param directory the directory to look for extension.yaml and PRESINSTALL.md in
 */
export async function getLocalExtensionSpec(directory: string): Promise<ExtensionSpec> {
  const spec = await parseYAML(await readFile(path.resolve(directory, EXTENSIONS_SPEC_FILE)));
  try {
    const preinstall = await readFile(path.resolve(directory, EXTENSIONS_PREINSTALL_FILE));
    spec.preinstallContent = preinstall;
  } catch (err) {
    logger.debug(`No PREINSTALL.md found in directory ${directory}.`);
  }
  return spec;
}

/**
 * Retrieves a file from the directory.
 * @param directory the directory containing the file
 * @param file the name of the file
 */
export async function readFile(pathToFile: string): Promise<string> {
  try {
    return fs.readFileSync(pathToFile, "utf8");
  } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      throw new FirebaseError(`YAML Error: ${err.message}`, { original: err });
    }
    throw new FirebaseError(err.message);
  }
}
