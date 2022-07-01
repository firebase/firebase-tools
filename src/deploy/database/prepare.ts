/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as clc from "cli-color";
import * as path from "path";

import { FirebaseError } from "../../error";
import { parseBoltRules } from "../../parseBoltRules";
import * as rtdb from "../../rtdb";
import * as utils from "../../utils";
import { Options } from "../../options";
import * as dbRulesConfig from "../../database/rulesConfig";

export function prepare(context: any, options: Options): Promise<any> {
  const rulesConfig = dbRulesConfig.getRulesConfig(context.projectId, options);
  const next = Promise.resolve();

  if (!rulesConfig || rulesConfig.length === 0) {
    return next;
  }

  const ruleFiles: Record<string, any> = {};
  const deploys: any[] = [];

  rulesConfig.forEach((ruleConfig: any) => {
    if (!ruleConfig.rules) {
      return;
    }

    ruleFiles[ruleConfig.rules] = null;
    deploys.push(ruleConfig);
  });

  for (const file of Object.keys(ruleFiles)) {
    switch (path.extname(file)) {
      case ".json":
        ruleFiles[file] = options.config.readProjectFile(file);
        break;
      case ".bolt":
        ruleFiles[file] = parseBoltRules(file);
        break;
      default:
        throw new FirebaseError("Unexpected rules format " + path.extname(file));
    }
  }

  context.database = {
    deploys: deploys,
    ruleFiles: ruleFiles,
  };
  utils.logBullet(clc.bold.cyan("database: ") + "checking rules syntax...");
  return Promise.all(
    deploys.map((deploy) => {
      return rtdb
        .updateRules(context.projectId, deploy.instance, ruleFiles[deploy.rules], { dryRun: true })
        .then(() => {
          utils.logSuccess(
            clc.bold.green("database: ") +
              "rules syntax for database " +
              clc.bold(deploy.instance) +
              " is valid"
          );
        });
    })
  );
}
