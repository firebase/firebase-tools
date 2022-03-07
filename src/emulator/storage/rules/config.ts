import { RulesConfig } from "..";
import { FirebaseError } from "../../../error";
import { Options } from "../../../options";

function getAbsoluteRulesPath(rules: string, options: Options): string {
  return options.config.path(rules);
}

export function getStorageRulesConfig(projectId: string, options: Options): RulesConfig[] {
  const storageConfig = options.config.data.storage;
  if (!storageConfig) {
    throw new FirebaseError(
      "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
    );
  }

  // Single resource
  if (!Array.isArray(storageConfig)) {
    if (!storageConfig.rules) {
      throw new FirebaseError(
        "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
      );
    }

    // TODO(hsinpei): set default resource
    const resource = "default";
    return [{ resource, rules: getAbsoluteRulesPath(storageConfig.rules, options) }];
  }

  // Multiple resources
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
