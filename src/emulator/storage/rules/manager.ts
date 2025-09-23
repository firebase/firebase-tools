import * as chokidar from "chokidar";
import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { SourceFile } from "./types";
import { StorageRulesIssues, StorageRulesRuntime, StorageRulesetInstance } from "./runtime";
import { RulesConfig } from "..";
import { readFile } from "../../../fsutils";

/**
 * Keeps track of rules source file(s) and generated ruleset(s), either one for all storage
 * resources or different rules for different resources.
 *
 * Example usage:
 *
 * ```
 * const rulesManager = createStorageRulesManager(initialRules);
 * rulesManager.start();
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

  /** Removes listeners from all files for all managed resources. */
  stop(): Promise<void>;
}

/**
 * Creates either a {@link DefaultStorageRulesManager} to manage rules for all resources or a
 * {@link ResourceBasedStorageRulesManager} for a subset of them, keyed by resource name.
 */
export function createStorageRulesManager(
  rules: SourceFile | RulesConfig[],
  runtime: StorageRulesRuntime,
): StorageRulesManager {
  return Array.isArray(rules)
    ? new ResourceBasedStorageRulesManager(rules, runtime)
    : new DefaultStorageRulesManager(rules, runtime);
}

/**
 * Maintains a {@link StorageRulesetInstance} for a given source file. Listens for changes to the
 * file and updates the ruleset accordingly.
 */
class DefaultStorageRulesManager implements StorageRulesManager {
  private _rules: SourceFile;
  private _ruleset?: StorageRulesetInstance;
  private _watcher = new chokidar.FSWatcher();
  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);

  constructor(
    _rules: SourceFile,
    private _runtime: StorageRulesRuntime,
  ) {
    this._rules = _rules;
  }

  async start(): Promise<StorageRulesIssues> {
    const issues = await this.loadRuleset();
    this.updateWatcher(this._rules.name);
    return issues;
  }

  getRuleset(): StorageRulesetInstance | undefined {
    return this._ruleset;
  }

  async stop(): Promise<void> {
    await this._watcher.close();
  }

  private updateWatcher(rulesFile: string): void {
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
          "Change detected, updating rules for Cloud Storage...",
        );
        this._rules.content = readFile(rulesFile);
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
          }:${parsedIssue.sourcePosition_.line_}`,
        );
      } catch {
        this._logger.logLabeled("WARN", "storage", issue);
      }
    });
    return issues;
  }
}

/**
 * Maintains a mapping from storage resource to {@link DefaultStorageRulesManager} and
 * directs calls to the appropriate instance.
 */
class ResourceBasedStorageRulesManager implements StorageRulesManager {
  private _rulesManagers = new Map<string, DefaultStorageRulesManager>();

  constructor(
    _rulesConfig: RulesConfig[],
    private _runtime: StorageRulesRuntime,
  ) {
    for (const { resource, rules } of _rulesConfig) {
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

  async stop(): Promise<void> {
    await Promise.all(
      Array.from(this._rulesManagers.values(), async (rulesManager) => await rulesManager.stop()),
    );
  }

  private createRulesManager(resource: string, rules: SourceFile): DefaultStorageRulesManager {
    const rulesManager = new DefaultStorageRulesManager(rules, this._runtime);
    this._rulesManagers.set(resource, rulesManager);
    return rulesManager;
  }
}
