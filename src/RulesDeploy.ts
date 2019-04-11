"use strict";

import _ = require("lodash");
import clc = require("cli-color");
import fs = require("fs");

import gcp = require("./gcp");
import logger = require("./logger");
import FirebaseError = require("./error");
import utils = require("./utils");

class RulesDeploy {
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
    const self = this;
    const promises: any[] = [];
    _.forEach(this.rulesFiles, (files: any, filename: any) => {
      promises.push(self._compileRuleset(filename, files));
    });
    return Promise.all(promises);
  }

  /**
   * Create rulesets for each file added to this deploy, and record
   * the name for use in the release process later.
   */
  createRulesets(): Promise<any> {
    const self = this;
    const promises: any = [];
    _.forEach(this.rulesFiles, (files: any, filename: any) => {
      utils.logBullet(
        clc.bold.cyan(self.type + ":") + " uploading rules " + clc.bold(filename) + "..."
      );
      promises.push(
        gcp.rules.createRuleset(self.options.project, files).then((rulesetName: any) => {
          self.rulesetNames[filename] = rulesetName;
        })
      );
    });
    return Promise.all(promises);
  }

  release(filename: any, resourceName: any): Promise<any> {
    const self = this;
    return gcp.rules
      .updateOrCreateRelease(this.options.project, this.rulesetNames[filename], resourceName)
      .then(() => {
        utils.logSuccess(
          clc.bold.green(self.type + ": ") +
            "released rules " +
            clc.bold(filename) +
            " to " +
            clc.bold(resourceName)
        );
      });
  }

  _compileRuleset(filename: any, files: any): Promise<any> {
    utils.logBullet(
      clc.bold.cyan(this.type + ":") +
        " checking " +
        clc.bold(filename) +
        " for compilation errors..."
    );
    const self = this;
    return gcp.rules.testRuleset(self.options.project, files).then((response: any) => {
      if (response.body && response.body.issues && response.body.issues.length > 0) {
        const warnings: any = [];
        const errors: any = [];
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
        clc.bold.green(self.type + ":") +
          " rules file " +
          clc.bold(filename) +
          " compiled successfully"
      );
      return Promise.resolve();
    });
  }
}

export = RulesDeploy;
