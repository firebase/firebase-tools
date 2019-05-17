import { DatabaseSize } from "../database/size";

import * as Command from "../command";
import * as requireInstance from "../requireInstance";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";
import * as lodash from "lodash";

module.exports = new Command("database:size <path>")
  .description(
    "esimate the size of the Firebase subtree rooted at the specified path " +
      "by recursively listing the sub-tree rooted at <path>"
  )
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .action((path: string, options: any) => {
    if (!lodash.startsWith(path, "/")) {
      return utils.reject("Path must begin with /", { exit: 1 });
    }
    const sizeOps: DatabaseSize = new DatabaseSize(options.instance, path);
    return sizeOps.execute().then((bytes: number) => {
      utils.logSuccess(path + " is approximately " + bytes + " bytes.");
    });
  });
