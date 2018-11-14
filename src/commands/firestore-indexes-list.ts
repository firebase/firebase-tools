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
    "--api",
    "Override the version of the Firestore indexes API to use, such as " + "v1beta1 or v1beta2."
  )
  .before(requirePermissions, ["datastore.indexes.list"])
  .action((options: any) => {
    if (options.api === "v1beta1") {
      const fsi = iv1 as FirestoreIndexApi<any>;
      return _listIndexes(fsi, options);
    } else {
      return _listIndexes(new iv2.FirestoreIndexes(), options);
    }
  });
