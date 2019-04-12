import _ = require("lodash");
import clc = require("cli-color");
import fs = require("fs");

import gcp = require("./gcp");
import logger = require("./logger");
import FirebaseError = require("./error");
import utils = require("./utils");

import * as prompt from "./prompt";

// The status code the Firebase Rules backend sends to indicate too many rulesets.
const QUOTA_EXCEEDED_STATUS_CODE = 429;

// How many old rulesets is enough to cause problems?
const RULESET_COUNT_LIMIT = 1000;

// how many old rulesets should we delete to free up quota?
const RULESETS_TO_GC = 10;

export class RulesDeploy {
  type: any;
  options: any;
  project: any;
  rulesFiles: any;
  rulesetNames: any;
  constructor(options: any, type: any) {
    this.type = type;
    this.options = options;
    this.project = options.project;
    this.rulesFiles = {};
    this.rulesetNames = {};
  }
  /**
   * Adds a new project-relative file to be included in compilation and
   * deployment for this RulesDeploy.
   */
  addFile(path: any): void {
    const fullPath = this.options.config.path(path);
    let src;
    try {
      src = fs.readFileSync(fullPath, "utf8");
    } catch (e) {
      logger.debug("[rules read error]", e.stack);
      throw new FirebaseError("Error reading rules file " + clc.bold(path));
    }

    this.rulesFiles[path] = [{ name: path, content: src }];
  }

  /**
   * Compile all rulesets tied to this deploy, rejecting on first
   * compilation error.
   */
  compile(): Promise<any> {
    const promises: any[] = [];
    _.forEach(this.rulesFiles, (files: any, filename: any) => {
      promises.push(this._compileRuleset(filename, files));
    });
    return Promise.all(promises);
  }

  /**
   * Create rulesets for each file added to this deploy, and record
   * the name for use in the release process later.
   */
  createRulesets(): Promise<any> {
    const promises: any[] = [];
    _.forEach(this.rulesFiles, (files: any, filename: any) => {
      utils.logBullet(
        clc.bold.cyan(this.type + ":") + " uploading rules " + clc.bold(filename) + "..."
      );
      promises.push(
        gcp.rules.createRuleset(this.options.project, files).then((rulesetName: any) => {
          this.rulesetNames[filename] = rulesetName;
        })
      );
    });
    return Promise.all(promises).catch(async (err) => {
      if (err.status === QUOTA_EXCEEDED_STATUS_CODE) {
        utils.logBullet(
          clc.bold.yellow(this.type + ":") + " quota exceeded error while uploading rules"
        );
        const history = await gcp.rules.listAllRulesets(this.options.project);
        if (history.length > RULESET_COUNT_LIMIT) {
          utils.logBullet(
            clc.bold.yellow(this.type + ":") +
              ` deleting ${RULESETS_TO_GC} oldest rules (of ${history.length})`
          );
          const shouldContinue = await prompt.once({
            type: "confirm",
            message: `You have ${history.length} rules, do you want to delete the oldest ${RULESETS_TO_GC} to free up space?`,
            default: false,
          });
          if (shouldContinue) {
            const entriesToDelete = _.sortBy(history, entry => entry.createTime).slice(0, RULESETS_TO_GC);
            for (const entry of entriesToDelete) {
              const rulesetId = entry.name.split("/").pop()!;
              await gcp.rules.deleteRuleset(this.options.project, rulesetId);
            }
            utils.logBullet(clc.bold.yellow(this.type + ":") + " retrying rules upload");
            return this.createRulesets();
          }
        }
      }
      throw err;
    });
  }

  release(filename: any, resourceName: any): Promise<any> {
    return gcp.rules
      .updateOrCreateRelease(this.options.project, this.rulesetNames[filename], resourceName)
      .then(() => {
        utils.logSuccess(
          clc.bold.green(this.type + ": ") +
            "released rules " +
            clc.bold(filename) +
            " to " +
            clc.bold(resourceName)
        );
      });
  }

  private _compileRuleset(filename: any, files: any): Promise<any> {
    utils.logBullet(
      clc.bold.cyan(this.type + ":") +
        " checking " +
        clc.bold(filename) +
        " for compilation errors..."
    );
    return gcp.rules.testRuleset(this.options.project, files).then((response: any) => {
      if (response.body && response.body.issues && response.body.issues.length > 0) {
        const warnings: any[] = [];
        const errors: any[] = [];
        response.body.issues.forEach((issue: any) => {
          const issueMessage =
            "[" +
            issue.severity.substring(0, 1) +
            "] " +
            issue.sourcePosition.line +
            ":" +
            issue.sourcePosition.column +
            " - " +
            issue.description;

          if (issue.severity === "ERROR") {
            errors.push(issueMessage);
          } else {
            warnings.push(issueMessage);
          }
        });

        if (warnings.length > 0) {
          warnings.forEach((warning: any) => {
            utils.logWarning(warning);
          });
        }

        if (errors.length > 0) {
          const add = errors.length === 1 ? "" : "s";
          const message =
            "Compilation error" + add + " in " + clc.bold(filename) + ":\n" + errors.join("\n");
          return utils.reject(message, { exit: 1 });
        }
      }

      utils.logSuccess(
        clc.bold.green(this.type + ":") +
          " rules file " +
          clc.bold(filename) +
          " compiled successfully"
      );
      return Promise.resolve();
    });
  }
}
