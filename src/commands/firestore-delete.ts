"use strict";

import * as clc from "cli-color";
import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { FirestoreDelete } from "../firestore/delete";
import { prompt } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";

function getConfirmationMessage(deleteOp: FirestoreDelete, options: any) {
  if (options.allCollections) {
    return (
      "You are about to delete " +
      clc.bold.yellow.underline("THE ENTIRE DATABASE") +
      " for " +
      clc.cyan(options.project) +
      ". Are you sure?"
    );
  }

  if (deleteOp.isDocumentPath) {
    // Recursive document delete
    if (options.recursive) {
      return (
        "You are about to delete the document at " +
        clc.cyan(deleteOp.path) +
        " and all of its subcollections. Are you sure?"
      );
    }

    // Shallow document delete
    return "You are about to delete the document at " + clc.cyan(deleteOp.path) + ". Are you sure?";
  }

  // Recursive collection delete
  if (options.recursive) {
    return (
      "You are about to delete all documents in the collection at " +
      clc.cyan(deleteOp.path) +
      " and all of their subcollections. " +
      "Are you sure?"
    );
  }

  // Shallow collection delete
  return (
    "You are about to delete all documents in the collection at " +
    clc.cyan(deleteOp.path) +
    ". Are you sure?"
  );
}

module.exports = new Command("firestore:delete [path]")
  .description("Delete data from Cloud Firestore.")
  .option(
    "-r, --recursive",
    "Recursive. Delete all documents and subcollections at and under the " +
      "specified level. May not be passed along with --shallow."
  )
  .option(
    "--shallow",
    "Shallow. Delete only documents at the specified level and ignore documents in " +
      "subcollections. This action can potentially orphan documents nested in " +
      "subcollections. May not be passed along with -r."
  )
  .option(
    "--all-collections",
    "Delete all. Deletes the entire Firestore database, " +
      "including all collections and documents. Any other flags or arguments will be ignored."
  )
  .option("-y, --yes", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(printNoticeIfEmulated, Emulators.FIRESTORE)
  .before(requirePermissions, ["datastore.entities.list", "datastore.entities.delete"])
  .action(async (path: string | undefined, options: any) => {
    // Guarantee path
    if (!path && !options.allCollections) {
      return utils.reject("Must specify a path.", { exit: 1 });
    }

    const deleteOp = new FirestoreDelete(options.project, path, {
      recursive: options.recursive,
      shallow: options.shallow,
      allCollections: options.allCollections,
    });

    if (!options.yes) {
      const res = await prompt(options, [
        {
          type: "confirm",
          name: "confirm",
          default: false,
          message: getConfirmationMessage(deleteOp, options),
        },
      ]);

      if (!res.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }
    }

    if (options.allCollections) {
      return deleteOp.deleteDatabase();
    }

    return deleteOp.execute();
  });
