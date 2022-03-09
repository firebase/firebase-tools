import * as chokidar from "chokidar";
import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { SourceFile } from "./types";
import { StorageRulesIssues, StorageRulesRuntime, StorageRulesetInstance } from "./runtime";
import { readFile } from "../../../fsutils";
import { RulesConfig, RulesType } from "..";

/**
 * Keeps track of the rules source file and maintains a generated ruleset for one or more storage
 * resources.
 * */
export interface StorageRulesManager {
  /** Sets source file for each resource using the rules previously passed in the constructor. */
  start: () => Promise<StorageRulesIssues>;

  /** Retrieves the generated ruleset for the resource. */
  getRuleset: (resource: string) => StorageRulesetInstance | undefined;

  /**
   * Updates the source file and, correspondingly, the file watcher and ruleset for the resource.
   * @throws {FirebaseError} if file path is invalid.
   */
  setSourceFile: (rules: RulesType, resource: string) => Promise<StorageRulesIssues>;

  /** Deletes source file, ruleset, and removes listeners from all files for all resources. */
  close: () => Promise<void>;
}

/**
 * Creates either a {@link StorageRulesManagerImplementation} to manage rules for a single resource
 * or a {@link StorageRulesManagerRegistry} for multiple resources.
 */
export function createStorageRulesManager(
  rules: RulesType | RulesConfig[],
  runtime: StorageRulesRuntime
): StorageRulesManager {
  return Array.isArray(rules)
    ? new StorageRulesManagerRegistry(rules, runtime)
    : new StorageRulesManagerImplementation(rules, runtime);
}

/**
 * Maintains a {@link StorageRulesetInstance} for a given source file. Listens for changes to the
 * file and updates the ruleset accordingly.
 */
class StorageRulesManagerImplementation implements StorageRulesManager {
  private _sourceFile?: SourceFile;
  private _ruleset?: StorageRulesetInstance;
  private _watcher = new chokidar.FSWatcher();
  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);

  constructor(private _initRules: RulesType, private _runtime: StorageRulesRuntime) {}

  async start(): Promise<StorageRulesIssues> {
    return this.setSourceFile(this._initRules);
  }

  getRuleset(): StorageRulesetInstance | undefined {
    return this._ruleset;
  }

  async setSourceFile(rules: RulesType): Promise<StorageRulesIssues> {
    const prevRulesFile = this._sourceFile?.name;
    let rulesFile: string;
    if (typeof rules === "string") {
      this._sourceFile = { name: rules, content: readFile(rules) };
      rulesFile = rules;
    } else {
      // Allow invalid file path here for testing
      this._sourceFile = rules;
      rulesFile = rules.name;
    }

    const issues = await this.loadRuleset();
    this.updateWatcher(rulesFile, prevRulesFile);
    return issues;
  }

  async close(): Promise<void> {
    delete this._sourceFile;
    delete this._ruleset;
    await this._watcher.close();
  }

  private updateWatcher(rulesFile: string, prevRulesFile?: string): void {
    if (prevRulesFile) {
      this._watcher.unwatch(prevRulesFile);
    }

    this._watcher = chokidar
      .watch(rulesFile, { persistent: true, ignoreInitial: true })
      .on("change", async () => {
        // There have been some race conditions reported (on Windows) where reading the
        // file too quickly after the watcher fires results in an empty file being read.
        // Adding a small delay prevents that at very little cost.
        await new Promise((res) => setTimeout(res, 5));

        this._logger.logLabeled(
          "BULLET",
          "storage",
          "Change detected, updating rules for Cloud Storage..."
        );
        await this.loadRuleset();
      });
  }

  private async loadRuleset(): Promise<StorageRulesIssues> {
    const { ruleset, issues } = await this._runtime.loadRuleset({ files: [this._sourceFile!] });

    if (ruleset) {
      this._ruleset = ruleset;
      return issues;
    }

    delete this._ruleset;
    issues.all.forEach((issue: string) => {
      try {
        const parsedIssue = JSON.parse(issue);
        this._logger.log(
          "WARN",
          `${parsedIssue.description_.replace(/\.$/, "")} in ${
            parsedIssue.sourcePosition_.fileName_
          }:${parsedIssue.sourcePosition_.line_}`
        );
      } catch {
        this._logger.log("WARN", issue);
      }
    });
    return issues;
  }
}

/**
 * Maintains a mapping from storage resource to {@link StorageRulesManagerImplementation} and
 * directs calls to the appropriate instance.
 */
class StorageRulesManagerRegistry {
  private _rulesManagers: Map<string, StorageRulesManagerImplementation>;

  constructor(_initRules: RulesConfig[], private _runtime: StorageRulesRuntime) {
    this._rulesManagers = new Map<string, StorageRulesManagerImplementation>();
    for (const { resource, rules } of _initRules) {
      this.createRulesManager(resource, rules);
    }
  }

  async start(): Promise<StorageRulesIssues> {
    const allIssues = new StorageRulesIssues();
    for (const rulesManager of this._rulesManagers.values()) {
      allIssues.extend(await rulesManager.start());
    }
    return allIssues;
  }

  getRuleset(resource: string): StorageRulesetInstance | undefined {
    return this._rulesManagers.get(resource)?.getRuleset();
  }

  async setSourceFile(rules: RulesType, resource: string): Promise<StorageRulesIssues> {
    const rulesManager =
      this._rulesManagers.get(resource) || this.createRulesManager(resource, rules);
    return rulesManager.setSourceFile(rules);
  }

  async close(): Promise<void> {
    for (const rulesManager of this._rulesManagers.values()) {
      await rulesManager.close();
    }
  }

  private createRulesManager(
    resource: string,
    rules: RulesType
  ): StorageRulesManagerImplementation {
    const rulesManager = new StorageRulesManagerImplementation(rules, this._runtime);
    this._rulesManagers.set(resource, rulesManager);
    return rulesManager;
  }
}
