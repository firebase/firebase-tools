import { RulesConfig } from "..";
import { FirebaseError } from "../../../error";
import { readFile } from "../../../fsutils";
import { Options } from "../../../options";
import { SourceFile } from "./types";
import { Constants } from "../../constants";
import { Emulators } from "../../types";
import { EmulatorLogger } from "../../emulatorLogger";
import { absoluteTemplateFilePath } from "../../../templates";

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
  options: Options,
): SourceFile | RulesConfig[] {
  const storageConfig = options.config.data.storage;
  const storageLogger = EmulatorLogger.forEmulator(Emulators.STORAGE);
  if (!storageConfig) {
    logDefaultRulesWarning(projectId, storageLogger);
    return defaultStorageRules();
  }

  // No target specified
  if (!Array.isArray(storageConfig)) {
    if (!storageConfig.rules) {
      logDefaultRulesWarning(projectId, storageLogger);
      return defaultStorageRules();
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
    const targets = rc.target(projectId, "storage", targetConfig.target);
    if (targets.length === 0) {
      // Fall back to open if this is a demo project or targets are missing
      if (Constants.isDemoProject(projectId)) {
        storageLogger.logLabeled(
          "BULLET",
          "storage",
          `Detected demo project ID "${projectId}", using a default (open) rules configuration. Storage targets in firebase.json will be ignored.`,
        );
      } else {
        storageLogger.logLabeled(
          "WARN",
          "storage",
          `Storage target '${targetConfig.target}' in firebase.json is not configured in .firebaserc. The emulator will default to allowing all reads and writes.`,
        );
      }
      return defaultStorageRules();
    }
    results.push(
      ...rc.target(projectId, "storage", targetConfig.target).map((resource: string) => {
        return { resource, rules: getSourceFile(targetConfig.rules, options) };
      }),
    );
  }
  return results;
}

function logDefaultRulesWarning(projectId: string, storageLogger: EmulatorLogger): void {
  if (Constants.isDemoProject(projectId)) {
    storageLogger.logLabeled(
      "BULLET",
      "storage",
      `Detected demo project ID "${projectId}", using a default (open) rules configuration.`,
    );
  } else {
    storageLogger.logLabeled(
      "WARN",
      "storage",
      "Did not find a Storage rules file specified in a firebase.json config file. The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration.",
    );
  }
}

function defaultStorageRules(): SourceFile {
  const defaultRulesPath = "emulators/default_storage.rules";
  const name = absoluteTemplateFilePath(defaultRulesPath);
  return { name, content: readFile(name) };
}
