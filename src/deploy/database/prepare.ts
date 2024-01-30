import * as clc from "colorette";
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
  utils.logBullet(clc.bold(clc.cyan("database: ")) + "checking rules syntax...");
  return Promise.all(
    deploys.map((deploy) => {
      return rtdb
        .updateRules(context.projectId, deploy.instance, ruleFiles[deploy.rules], { dryRun: true })
        .then(() => {
          utils.logSuccess(
            clc.bold(clc.green("database: ")) +
              "rules syntax for database " +
              clc.bold(deploy.instance) +
              " is valid",
          );
        });
    }),
  );
}
