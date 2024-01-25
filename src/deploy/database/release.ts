import * as clc from "colorette";

import * as rtdb from "../../rtdb";
import * as utils from "../../utils";

export function release(context: any): Promise<any> {
  if (
    !context.projectId ||
    !context.database ||
    !context.database.deploys ||
    !context.database.ruleFiles
  ) {
    return Promise.resolve();
  }

  const deploys = context.database.deploys;
  const ruleFiles = context.database.ruleFiles;

  utils.logBullet(clc.bold(clc.cyan("database: ")) + "releasing rules...");
  return Promise.all(
    deploys.map((deploy: any) => {
      return rtdb
        .updateRules(context.projectId, deploy.instance, ruleFiles[deploy.rules], {
          dryRun: false,
        })
        .then(() => {
          utils.logSuccess(
            clc.bold(clc.green("database: ")) +
              "rules for database " +
              clc.bold(deploy.instance) +
              " released successfully",
          );
        });
    }),
  );
}
