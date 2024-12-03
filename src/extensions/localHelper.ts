import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "yaml";

import { fileExistsSync } from "../fsutils";
import { FirebaseError, isObject } from "../error";
import { ExtensionSpec, isExtensionSpec, LifecycleEvent, LifecycleStage } from "./types";
import { logger } from "../logger";
import { validateSpec } from "./extensionsHelper";

export const EXTENSIONS_SPEC_FILE = "extension.yaml";
const EXTENSIONS_PREINSTALL_FILE = "PREINSTALL.md";

/**
 * Retrieves and parses an ExtensionSpec from a local directory
 * @param directory the directory to look for extension.yaml and PRESINSTALL.md in
 */
export async function getLocalExtensionSpec(directory: string): Promise<ExtensionSpec> {
  const spec = await parseYAML(readFile(path.resolve(directory, EXTENSIONS_SPEC_FILE)));

  // lifecycleEvents are formatted differently once they have been uploaded
  if (spec.lifecycleEvents as Object) {
    spec.lifecycleEvents = fixLifecycleEvents(spec.lifecycleEvents);
  }

  if (!isExtensionSpec(spec)) {
    validateSpec(spec); // Maybe throw with more details
    throw new FirebaseError(
      "Error: extension.yaml does not contain a valid extension specification.",
    );
  }
  try {
    const preinstall = readFile(path.resolve(directory, EXTENSIONS_PREINSTALL_FILE));
    spec.preinstallContent = preinstall;
  } catch (err) {
    logger.debug(`No PREINSTALL.md found in directory ${directory}.`);
  }
  return spec;
}

function fixLifecycleEvents(lifecycleEvents: unknown): LifecycleEvent[] {
  const stages: Record<string, LifecycleStage> = {
    onInstall: "ON_INSTALL",
    onUpdate: "ON_UPDATE",
    onConfigure: "ON_CONFIGURE",
    stageUnspecified: "STAGE_UNSPECIFIED",
  };
  const arrayLifecycle = [] as LifecycleEvent[];
  if (isObject(lifecycleEvents)) {
    for (const [key, val] of Object.entries(lifecycleEvents)) {
      if (
        isObject(val) &&
        typeof val.function === "string" &&
        typeof val.processingMessage === "string"
      ) {
        arrayLifecycle.push({
          stage: stages[key] || stages["stageUnspecified"],
          taskQueueTriggerFunction: val.function,
        });
      }
    }
  }
  return arrayLifecycle;
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
 * @param pathToFile the path to the file to read
 */
export function readFile(pathToFile: string): string {
  try {
    return fs.readFileSync(pathToFile, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FirebaseError(`Could not find "${pathToFile}"`, { original: err });
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
 * Wraps `yaml.parse` with an error handler to present better YAML parsing
 * errors.
 * @param source an unparsed YAML string
 */
function parseYAML(source: string): any {
  try {
    return yaml.parse(source);
  } catch (err: any) {
    if (err instanceof yaml.YAMLParseError) {
      throw new FirebaseError(`YAML Error: ${err.message}`, { original: err });
    }
    throw new FirebaseError(err.message);
  }
}
