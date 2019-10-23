import * as Command from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import * as requirePermissions from "../requirePermissions";
import * as metadata from "../database/metadata";
import * as fs from "fs-extra";
import * as path from "path";

export default new Command("database:rules:create <filepath>")
  .description("create a new realtime database ruleset")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .action(async (filepath: string, options: any) => {
    logger.info(`creating ruleset from ${filepath}`);
    const source = fs.readFileSync(path.resolve(filepath), "utf8");
    const ruleset = await metadata.createRuleset(options.instance, source);
    logger.info(`created ruleset ${ruleset}`);
    return ruleset;
  });
