import * as chokidar from "chokidar";
import * as fs from "fs";
import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";
import { SourceFile } from "./types";
import { StorageRulesIssues, StorageRulesRuntime, StorageRulesetInstance } from "./runtime";

/**
 * Loads and maintains a {@link StorageRulesetInstance} for a given source file. Listens for
 * changes to the file and updates the ruleset accordingly.
 */
export class StorageRulesManager {
  private _sourceFile?: SourceFile;
  private _ruleset?: StorageRulesetInstance;
  private _watcher = new chokidar.FSWatcher();
  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);

  private constructor(private _runtime: StorageRulesRuntime) {}

  /**
   * Constructs and initializes a {@link StorageRulesManager}. This must be done in a factory
   * method in order to load the ruleset from the runtime asynchronously.
   */
  public static async createInstance(
    rules: SourceFile | string,
    runtime: StorageRulesRuntime
  ): Promise<StorageRulesManager> {
    const instance = new StorageRulesManager(runtime);
    await instance.setSourceFile(rules);
    return instance;
  }

  get ruleset(): StorageRulesetInstance | undefined {
    return this._ruleset;
  }

  get watcher(): chokidar.FSWatcher {
    return this._watcher;
  }

  /**
   * Updates the source file and, correspondingly, the file watcher and ruleset.
   */
  public async setSourceFile(rules: SourceFile | string): Promise<StorageRulesIssues> {
    const prevRulesFile = this._sourceFile?.name;
    let rulesFile: string;
    if (typeof rules === "string") {
      this._sourceFile = { name: rules, content: fs.readFileSync(rules).toString() };
      rulesFile = rules;
    } else {
      this._sourceFile = rules;
      rulesFile = rules.name;
    }

    const issues = await this.loadRuleset();
    this.updateWatcher(rulesFile, prevRulesFile);
    return issues;
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

    issues.all.forEach((issue) => {
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
    delete this._ruleset;
    return issues;
  }
}
