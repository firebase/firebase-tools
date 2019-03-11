import * as Command from "../command";
import * as clc from "cli-color";
import * as logger from "../logger";
import * as requirePermissions from "../requirePermissions";
import * as gcp from "../gcp";

module.exports = new Command("rules:list")
  .description("List your project's historical rulesets.")
  .before(requirePermissions, ["datastore.indexes.list"])
  .action(async (options: any) => {
    return gcp.rules.listRulesets(options.project)
      .then(result => {
        console.log(result);
      });
  });
