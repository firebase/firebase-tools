"use strict";

import * as Command from "../command";
import * as iv1 from "../firestore/indexesV1Beta1";
import * as iv2 from "../firestore/indexesV1Beta2";
import * as requirePermissions from "../requirePermissions";

module.exports = new Command("firestore:indexes")
  .description("List indexes in your project's Cloud Firestore database.")
  .option(
    "--pretty",
    "Pretty print. When not specified the indexes are printed in the " +
      "JSON specification format.",
  )
  .option(
    "--v1beta1",
    "Use the v1beta1 index API, which does not have support for " +
      " array indexes, single-field index controls, etc."
  )
  .before(requirePermissions, ["datastore.indexes.list"])
  .action((options: any) => {
    if (options.v1beta1) {
      return iv1.list(options.project).then((indexes: any[]) => {
        iv1.printIndexes(indexes, options.pretty);
        return iv1.makeIndexSpec(indexes);
      });
    }

    return iv2.FirestoreIndexes.list(options.project).then((indexes) => {
      iv2.FirestoreIndexes.printIndexes(indexes, options.pretty);
      return iv2.FirestoreIndexes.makeIndexSpec(indexes);
    });
  });
