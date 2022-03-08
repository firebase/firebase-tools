import { RulesConfig } from "..";
import { FirebaseError } from "../../../error";
import { Options } from "../../../options";

function getAbsoluteRulesPath(rules: string, options: Options): string {
  return options.config.path(rules);
}

/**
 * Parses rules file for each target specified in the storage config under {@link options}.
 * @returns Array of project resources and their corresponding rules files.
 * @throws {FirebaseError} if storage config or rules file is missing from firebase.json.
 */
export function getStorageRulesConfig(projectId: string, options: Options): RulesConfig[] {
  const storageConfig = options.config.data.storage;
  if (!storageConfig) {
    throw new FirebaseError(
      "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
    );
  }

  // Single target
  if (!Array.isArray(storageConfig)) {
    if (!storageConfig.rules) {
      throw new FirebaseError(
        "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
      );
    }

    // TODO(hsinpei): set default resource
    return [{ resource: "default", rules: getAbsoluteRulesPath(storageConfig.rules, options) }];
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
      results.push({ resource, rules: getAbsoluteRulesPath(targetConfig.rules, options) });
    });
  }
  return results;
}
