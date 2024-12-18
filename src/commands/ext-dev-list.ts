import * as clc from "colorette";
import { Command } from "../command.js";
import { FirebaseError, getErrMsg } from "../error.js";
import { last, logLabeledBullet } from "../utils.js";
import { listExtensions } from "../extensions/publisherApi.js";
import { logger } from "../logger.js";
import { logPrefix, unpackExtensionState } from "../extensions/extensionsHelper.js";
import { requireAuth } from "../requireAuth.js";
import Table from "cli-table";

/**
 * List all extensions uploaded under publisher ID.
 */
export const command = new Command("ext:dev:list <publisherId>")
  .description("list all extensions uploaded under publisher ID")
  .before(requireAuth)
  .action(async (publisherId: string) => {
    let extensions;
    try {
      extensions = await listExtensions(publisherId);
    } catch (err: unknown) {
      throw new FirebaseError(getErrMsg(err));
    }

    if (extensions.length < 1) {
      throw new FirebaseError(
        `There are no extensions uploaded under publisher ID ${clc.bold(
          publisherId,
        )}. This could happen for two reasons:\n` +
          "  - The publisher ID doesn't exist or could be misspelled\n" +
          "  - This publisher has not uploaded any extensions\n\n" +
          "If you are expecting some extensions to appear, please make sure you have the correct publisher ID and try again.",
      );
    }

    const table = new Table({
      head: ["Extension ID", "State", "Latest Version", "Version in Extensions Hub"],
      style: { head: ["yellow"] },
    });
    const sorted = extensions.sort((a, b) => a.ref.localeCompare(b.ref));
    sorted.forEach((extension) => {
      table.push([
        last(extension.ref.split("/")),
        unpackExtensionState(extension),
        extension.latestVersion ?? "-",
        extension.latestApprovedVersion ?? "-",
      ]);
    });

    logLabeledBullet(
      logPrefix,
      `list of uploaded extensions for publisher ${clc.bold(publisherId)}:`,
    );
    logger.info(table.toString());
    return { extensions: sorted };
  });
