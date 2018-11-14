"use strict";

import * as Command from "../command";
import { FirestoreIndexApi } from "../firestore/indexes";
import * as iv1 from "../firestore/indexesV1Beta1";
import * as iv2 from "../firestore/indexesV1Beta2";
import * as requirePermissions from "../requirePermissions";

function _listIndexes<T>(fsIndexes: FirestoreIndexApi<T>, options: any): any {
  return fsIndexes.list(options.project).then((indexes) => {
    fsIndexes.printIndexes(indexes, options.pretty);
    return fsIndexes.makeIndexSpec(indexes);
  });
}

module.exports = new Command("firestore:indexes")
  .description("List indexes in your project's Cloud Firestore database.")
  .option(
    "--pretty",
    "Pretty print. When not specified the indexes are printed in the " +
      "JSON specification format."
  )
  .option(
    "--v1beta1",
    "Use the v1beta1 index API, which does not have support for " +
      " array indexes, single-field index controls, etc."
  )
  .before(requirePermissions, ["datastore.indexes.list"])
  .action((options: any) => {
    // TODO: Better option name
    if (options.v1beta1) {
      const fsi = iv1 as FirestoreIndexApi<any>;
      return _listIndexes(fsi, options);
    } else {
      return _listIndexes(new iv2.FirestoreIndexes(), options);
    }
  });
