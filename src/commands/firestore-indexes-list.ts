"use strict";

import * as Command from "../command";
import * as fsi from "../firestore/indexes";
import * as requirePermissions from "../requirePermissions";

module.exports = new Command("firestore:indexes")
  .description("List indexes in your project's Cloud Firestore database.")
  .option(
    "--pretty",
    "Pretty print. When not specified the indexes are printed in the " +
      "JSON specification format."
  )
  .before(requirePermissions, ["datastore.indexes.list"])
  .action((options: any) => {
    const indexApi = new fsi.FirestoreIndexes();
    return indexApi.list(options.project).then((indexes) => {
      indexApi.printIndexes(indexes, options.pretty);
      return indexApi.makeIndexSpec(indexes);
    });
  });
