import * as chokidar from "chokidar";
import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { SourceFile } from "./types";
import { StorageRulesIssues, StorageRulesRuntime, StorageRulesetInstance } from "./runtime";
<<<<<<< HEAD
<<<<<<< HEAD
import { RulesConfig } from "..";

/**
 * Keeps track of rules source file(s) and generated ruleset(s), either one for all storage
 * resources or different rules for different resources.
 *
 * Example usage:
 *
 * ```
 * const rulesManager = createStorageRulesManager(initialRules);
 * rulesManager.start();
 * rulesManager.updateSourceFile(newRules);
 * rulesManager.stop();
 * ```
 */
export interface StorageRulesManager {
  /** Sets source file for each resource using the most recent rules. */
  start(): Promise<StorageRulesIssues>;

  /**
   * Retrieves the generated ruleset for the resource. Returns undefined if the resource is invalid
   * or if the ruleset has not been generated.
   */
  getRuleset(resource: string): StorageRulesetInstance | undefined;

  /**
   * Updates the source file and, correspondingly, the file watcher and ruleset for the resource.
   * Returns an array of errors and/or warnings that arise from loading the ruleset.
   */
  updateSourceFile(rules: SourceFile, resource: string): Promise<StorageRulesIssues>;

  /** Removes listeners from all files for all managed resources. */
  stop(): Promise<void>;
}

/**
 * Creates either a {@link DefaultStorageRulesManager} to manage rules for all resources or a
 * {@link ResourceBasedStorageRulesManager} for a subset of them, keyed by resource name.
 */
export function createStorageRulesManager(
  rules: SourceFile | RulesConfig[],
  runtime: StorageRulesRuntime
): StorageRulesManager {
  return Array.isArray(rules)
    ? new ResourceBasedStorageRulesManager(rules, runtime)
    : new DefaultStorageRulesManager(rules, runtime);
=======
import { readFile } from "../../../fsutils";
import { RulesConfig, RulesType } from "..";
=======
import { RulesConfig } from "..";
>>>>>>> f54e03ec (Change emulator arg to take SourceFile only)

/**
 * Keeps track of the rules source file and maintains a generated ruleset for one or more storage
 * resources.
 *
 * Example usage:
 *
 * ```
 * const rulesManager = createStorageRulesManager(initialRules);
 * rulesManager.start();
 * rulesManager.updateSourceFile(newRules);
 * rulesManager.stop();
 * ```
 */
export interface StorageRulesManager {
  /** Sets source file for each resource using the rules previously passed in the constructor. */
  start(): Promise<StorageRulesIssues>;

  /**
   * Retrieves the generated ruleset for the resource. Returns undefined if the resource is invalid
   * or if the ruleset has not been generated.
   */
  getRuleset(resource: string): StorageRulesetInstance | undefined;

  /**
   * Updates the source file and, correspondingly, the file watcher and ruleset for the resource.
   * Returns an array of errors and/or warnings that arise from loading the ruleset.
   */
  updateSourceFile(rules: SourceFile, resource: string): Promise<StorageRulesIssues>;

  /** Removes listeners from all files for all resources. */
  stop(): Promise<void>;
}

/**
 * Creates either a {@link DefaultStorageRulesManager} to manage rules for a single resource
 * or a {@link ResourceBasedStorageRulesManager} for multiple resources.
 */
export function createStorageRulesManager(
  rules: SourceFile | RulesConfig[],
  runtime: StorageRulesRuntime
): StorageRulesManager {
  return Array.isArray(rules)
<<<<<<< HEAD
    ? new StorageRulesManagerRegistry(rules, runtime)
    : new StorageRulesManagerImplementation(rules, runtime);
>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
    ? new ResourceBasedStorageRulesManager(rules, runtime)
    : new DefaultStorageRulesManager(rules, runtime);
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
}

/**
 * Maintains a {@link StorageRulesetInstance} for a given source file. Listens for changes to the
 * file and updates the ruleset accordingly.
 */
<<<<<<< HEAD
<<<<<<< HEAD
class DefaultStorageRulesManager implements StorageRulesManager {
  private _rules: SourceFile;
=======
class StorageRulesManagerImplementation implements StorageRulesManager {
  private _sourceFile?: SourceFile;
>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
class DefaultStorageRulesManager implements StorageRulesManager {
  private _rules: SourceFile;
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
  private _ruleset?: StorageRulesetInstance;
  private _watcher = new chokidar.FSWatcher();
  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  constructor(_rules: SourceFile, private _runtime: StorageRulesRuntime) {
    this._rules = _rules;
  }

  start(): Promise<StorageRulesIssues> {
    return this.updateSourceFile(this._rules);
=======
  constructor(private _initRules: RulesType, private _runtime: StorageRulesRuntime) {}
=======
  constructor(private _initRules: SourceFile, private _runtime: StorageRulesRuntime) {}
>>>>>>> f54e03ec (Change emulator arg to take SourceFile only)

  async start(): Promise<StorageRulesIssues> {
    return this.setSourceFile(this._initRules);
>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
  constructor(_rules: SourceFile, private _runtime: StorageRulesRuntime) {
    this._rules = _rules;
  }

  start(): Promise<StorageRulesIssues> {
    return this.updateSourceFile(this._rules);
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
  }

  getRuleset(): StorageRulesetInstance | undefined {
    return this._ruleset;
  }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  async updateSourceFile(rules: SourceFile): Promise<StorageRulesIssues> {
    const prevRulesFile = this._rules.name;
    this._rules = rules;
=======
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

>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
  async setSourceFile(rules: SourceFile): Promise<StorageRulesIssues> {
    const prevRulesFile = this._sourceFile?.name;
    this._sourceFile = rules;
>>>>>>> f54e03ec (Change emulator arg to take SourceFile only)
=======
  async updateSourceFile(rules: SourceFile): Promise<StorageRulesIssues> {
    const prevRulesFile = this._rules.name;
    this._rules = rules;
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
    const issues = await this.loadRuleset();
    this.updateWatcher(rules.name, prevRulesFile);
    return issues;
  }

<<<<<<< HEAD
<<<<<<< HEAD
  async stop(): Promise<void> {
=======
  async close(): Promise<void> {
    delete this._sourceFile;
    delete this._ruleset;
>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
  async stop(): Promise<void> {
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
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
    const { ruleset, issues } = await this._runtime.loadRuleset({ files: [this._rules] });

    if (ruleset) {
      this._ruleset = ruleset;
      return issues;
    }

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
<<<<<<< HEAD
<<<<<<< HEAD
 * Maintains a mapping from storage resource to {@link DefaultStorageRulesManager} and
 * directs calls to the appropriate instance.
 */
class ResourceBasedStorageRulesManager implements StorageRulesManager {
  private _rulesManagers = new Map<string, DefaultStorageRulesManager>();

  constructor(_rulesConfig: RulesConfig[], private _runtime: StorageRulesRuntime) {
    for (const { resource, rules } of _rulesConfig) {
=======
 * Maintains a mapping from storage resource to {@link StorageRulesManagerImplementation} and
=======
 * Maintains a mapping from storage resource to {@link DefaultStorageRulesManager} and
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
 * directs calls to the appropriate instance.
 */
class ResourceBasedStorageRulesManager implements StorageRulesManager {
  private _rulesManagers = new Map<string, DefaultStorageRulesManager>();

<<<<<<< HEAD
  constructor(_initRules: RulesConfig[], private _runtime: StorageRulesRuntime) {
    this._rulesManagers = new Map<string, StorageRulesManagerImplementation>();
    for (const { resource, rules } of _initRules) {
>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
  constructor(_rulesConfig: RulesConfig[], private _runtime: StorageRulesRuntime) {
    for (const { resource, rules } of _rulesConfig) {
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
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

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  updateSourceFile(rules: SourceFile, resource: string): Promise<StorageRulesIssues> {
    const rulesManager =
      this._rulesManagers.get(resource) || this.createRulesManager(resource, rules);
    return rulesManager.updateSourceFile(rules);
  }

  async stop(): Promise<void> {
    await Promise.all(
      Array.from(this._rulesManagers.values(), async (rulesManager) => await rulesManager.stop())
    );
  }

  private createRulesManager(resource: string, rules: SourceFile): DefaultStorageRulesManager {
    const rulesManager = new DefaultStorageRulesManager(rules, this._runtime);
=======
  async setSourceFile(rules: RulesType, resource: string): Promise<StorageRulesIssues> {
=======
  async setSourceFile(rules: SourceFile, resource: string): Promise<StorageRulesIssues> {
>>>>>>> f54e03ec (Change emulator arg to take SourceFile only)
=======
  updateSourceFile(rules: SourceFile, resource: string): Promise<StorageRulesIssues> {
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
    const rulesManager =
      this._rulesManagers.get(resource) || this.createRulesManager(resource, rules);
    return rulesManager.updateSourceFile(rules);
  }

  async stop(): Promise<void> {
    await Promise.all(
      Array.from(this._rulesManagers.values(), async (rulesManager) => await rulesManager.stop())
    );
  }

<<<<<<< HEAD
  private createRulesManager(
    resource: string,
    rules: SourceFile
  ): StorageRulesManagerImplementation {
    const rulesManager = new StorageRulesManagerImplementation(rules, this._runtime);
>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
  private createRulesManager(resource: string, rules: SourceFile): DefaultStorageRulesManager {
    const rulesManager = new DefaultStorageRulesManager(rules, this._runtime);
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
    this._rulesManagers.set(resource, rulesManager);
    return rulesManager;
  }
}
