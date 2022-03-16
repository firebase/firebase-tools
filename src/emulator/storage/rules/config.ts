import { RulesConfig } from "..";
import { FirebaseError } from "../../../error";
import { readFile } from "../../../fsutils";
import { Options } from "../../../options";
import { SourceFile } from "./types";

function getSourceFile(rules: string, options: Options): SourceFile {
  const path = options.config.path(rules);
  return { name: path, content: readFile(path) };
}

/**
 * Parses rules file for each target specified in the storage config under {@link options}.
 * @returns The rules file path if the storage config does not specify a target and an array
 *     of project resources and their corresponding rules files otherwise.
 * @throws {FirebaseError} if storage config is missing or rules file is missing or invalid.
 */
export function getStorageRulesConfig(
  projectId: string,
  options: Options
): SourceFile | RulesConfig[] {
  const storageConfig = options.config.data.storage;
  if (!storageConfig) {
    throw new FirebaseError(
      "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
    );
  }

  // No target specified
  if (!Array.isArray(storageConfig)) {
    if (!storageConfig.rules) {
      throw new FirebaseError(
        "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
      );
    }

    return getSourceFile(storageConfig.rules, options);
  }

  // Multiple targets
  const results: RulesConfig[] = [];
  const { rc } = options;
  for (const targetConfig of storageConfig) {
    if (!targetConfig.target) {
      throw new FirebaseError("Must supply 'target' in Storage configuration");
    }
    rc.requireTarget(projectId, "storage", targetConfig.target);
    rc.target(projectId, "storage", targetConfig.target).forEach((resource: string) => {
      results.push({ resource, rules: getSourceFile(targetConfig.rules, options) });
    });
  }
  return results;
}
