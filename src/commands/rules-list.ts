import * as Command from "../command";
import * as clc from "cli-color";
import * as logger from "../logger";
import * as requirePermissions from "../requirePermissions";
import * as gcp from "../gcp";
import { PageOfRulesets } from "../gcp/rules";

module.exports = new Command("rules:list")
  .description("List your project's historical rulesets.")
  .before(requirePermissions, ["firebaserules.rulesets.list"])
  .action(async (options: any) => {
    let page: PageOfRulesets = { rulesets: [] };
    do {
      page = await gcp.rules.listRulesets(options.project, page.nextPageToken);
      for (const item of page.rulesets) {
        logger.info(JSON.stringify(item));
      }
    } while (page.nextPageToken);
  });
