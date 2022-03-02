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
  private _sourceFile!: SourceFile;
  private _ruleset?: StorageRulesetInstance;
  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);

  private constructor(_rules: SourceFile | string, private _runtime: StorageRulesRuntime) {
    this.updateSourceFile(_rules);

    const rulesFile = typeof _rules === "string" ? _rules : _rules.name;
    chokidar.watch(rulesFile, { persistent: true, ignoreInitial: true }).on("change", async () => {
      // There have been some race conditions reported (on Windows) where reading the
      // file too quickly after the watcher fires results in an empty file being read.
      // Adding a small delay prevents that at very little cost.
      await new Promise((res) => setTimeout(res, 5));

      this._logger.logLabeled(
        "BULLET",
        "storage",
        "Change detected, updating rules for Cloud Storage..."
      );
      this.updateSourceFile(this._sourceFile.name);
      await this.loadRuleset();
    });
  }

  /**
   * Constructs and initializes a {@link StorageRulesManager}. This must be done in a factory
   * method in order to load the ruleset from the runtime asynchronously.
   */
  public static async createInstance(
    rules: SourceFile | string,
    runtime: StorageRulesRuntime
  ): Promise<StorageRulesManager> {
    const instance = new StorageRulesManager(rules, runtime);
    await instance.loadRuleset();
    return instance;
  }

  get ruleset(): StorageRulesetInstance | undefined {
    return this._ruleset;
  }

  /**
   * Manually updates the ruleset from a new source file or its file name. This overrides the
   * current ruleset.
   */
  public async loadRuleset(rules?: SourceFile | string): Promise<StorageRulesIssues> {
    if (rules) {
      this.updateSourceFile(rules);
    }

    const { ruleset, issues } = await this._runtime.loadRuleset({ files: [this._sourceFile] });
    if (ruleset) {
      this._ruleset = ruleset;
    } else {
      issues.all.forEach((issue) => {
        let parsedIssue;
        try {
          parsedIssue = JSON.parse(issue);
        } catch {
          // Parse manually
        }

        if (parsedIssue) {
          this._logger.log(
            "WARN",
            `${parsedIssue.description_.replace(/\.$/, "")} in ${
              parsedIssue.sourcePosition_.fileName_
            }:${parsedIssue.sourcePosition_.line_}`
          );
        } else {
          this._logger.log("WARN", issue);
        }
      });

      delete this._ruleset;
    }
    return issues;
  }

  private updateSourceFile(rules: SourceFile | string): void {
    if (typeof rules === "string") {
      this._sourceFile = { name: rules, content: fs.readFileSync(rules).toString() };
    } else {
      this._sourceFile = rules;
    }
  }
}
