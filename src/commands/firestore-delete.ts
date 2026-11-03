"use strict";

import * as clc from "colorette";
import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { FirestoreDelete } from "../firestore/delete";
import { confirm } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { FirestoreOptions } from "../firestore/options";

function confirmationMessage(deleteOp: FirestoreDelete, options: FirestoreOptions): string {
  if (options.allCollections) {
    return (
      "You are about to delete " +
      clc.bold(clc.yellow(clc.underline("THE ENTIRE DATABASE"))) +
      " for " +
      clc.cyan(deleteOp.getRoot()) +
      ". Are you sure?"
    );
  }

  if (deleteOp.isDocumentPath) {
    // Recursive document delete
    if (options.recursive) {
      return (
        "You are about to delete the document at " +
        clc.cyan(deleteOp.path) +
        " and all of its subcollections " +
        " for " +
        clc.cyan(deleteOp.getRoot()) +
        ". Are you sure?"
      );
    }

    // Shallow document delete
    return (
      "You are about to delete the document at " +
      clc.cyan(deleteOp.path) +
      " for " +
      clc.cyan(deleteOp.getRoot()) +
      ". Are you sure?"
    );
  }

  // Recursive collection delete
  if (options.recursive) {
    return (
      "You are about to delete all documents in the collection at " +
      clc.cyan(deleteOp.path) +
      " and all of their subcollections " +
      " for " +
      clc.cyan(deleteOp.getRoot()) +
      ". Are you sure?"
    );
  }

  // Shallow collection delete
  return (
    "You are about to delete all documents in the collection at " +
    clc.cyan(deleteOp.path) +
    " for " +
    clc.cyan(deleteOp.getRoot()) +
    ". Are you sure?"
  );
}

export const command = new Command("firestore:delete [path]")
  .description(
    "delete a document or collection at [path] from a Cloud Firestore database. " +
      "[path] is required unless --all-collections is passed. Deleting a collection, " +
      "or a document that has subcollections, requires either -r or --shallow",
  )
  .option(
    "-r, --recursive",
    "recursively delete all documents and subcollections at and under [path]. " +
      "May not be passed along with --shallow",
  )
  .option(
    "--shallow",
    "delete only documents at [path] and ignore documents in subcollections. " +
      "This action can potentially orphan documents nested in subcollections. " +
      "May not be passed along with -r",
  )
  .option(
    "--all-collections",
    "delete all collections and documents in the Firestore database (no [path] needed)",
  )
  .withForce()
  .option(
    "--database <databaseId>",
    'Database ID for database to delete from. "(default)" if none is provided.',
  )
  .before(printNoticeIfEmulated, Emulators.FIRESTORE)
  .before(requirePermissions, ["datastore.entities.list", "datastore.entities.delete"])
  .action(async (path: string | undefined, options: FirestoreOptions) => {
    // Guarantee path
    if (!path && !options.allCollections) {
      return utils.reject(
        "Must specify a document or collection path, or pass --all-collections to delete the entire database.",
        { exit: 1 },
      );
    }

    if (!options.database) {
      options.database = "(default)";
    }

    const deleteOp = new FirestoreDelete(options.project, path, {
      recursive: options.recursive,
      shallow: options.shallow,
      allCollections: options.allCollections,
      databaseId: options.database,
    });

    const confirmed = await confirm({
      message: confirmationMessage(deleteOp, options),
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      return utils.reject("Command aborted.", { exit: 1 });
    }

    if (options.allCollections) {
      return deleteOp.deleteDatabase();
    }

    return deleteOp.execute();
  });
