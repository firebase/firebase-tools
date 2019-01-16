import * as Command from "../command";
import * as clc from "cli-color";
import * as fsi from "../firestore/get";
import * as logger from "../logger";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";

module.exports = new Command("firestore:get [path]")
  .description("Get a document from Cloud Firestore.")
  .option(
      "-y, --yes",
      "No confirmation. Otherwise, a confirmation prompt will appear."
  )
  .before(
      requirePermissions,
      ["datastore.entities.list", "datastore.entities.get"])
  .action(async (path: string, options: any) => {
    // Guarantee path
    if (!path) {
      return utils.reject("Must specify a path.", { exit: 1 });
    }

    const getApi = new fsi.FirestoreGet(options.project, path, options);

    const checkPrompt = Promise.resolve({ confirm: true });

    return checkPrompt.then(function(res) {
      if (!res.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      return getApi.execute();
    });
  });
