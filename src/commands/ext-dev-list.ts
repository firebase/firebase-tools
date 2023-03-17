import * as clc from "colorette";
const Table = require("cli-table");

import { Command } from "../command";
import { FirebaseError } from "../error";
import { last, logLabeledBullet } from "../utils";
import { listExtensions } from "../extensions/extensionsApi";
import { logger } from "../logger";
import { logPrefix } from "../extensions/extensionsHelper";
import { requireAuth } from "../requireAuth";
import * as extensionsUtils from "../extensions/utils";

/**
 * List all published extensions associated with this publisher ID.
 */
export const command = new Command("ext:dev:list <publisherId>")
  .description("list all published extensions associated with this publisher ID")
  .before(requireAuth)
  .action(async (publisherId: string) => {
    let extensions;
    try {
      extensions = await listExtensions(publisherId);
    } catch (err: any) {
      throw new FirebaseError(err);
    }

    if (extensions.length < 1) {
      throw new FirebaseError(
        `There are no published extensions associated with publisher ID ${clc.bold(
          publisherId
        )}. This could happen for two reasons:\n` +
          "  - The publisher ID doesn't exist or could be misspelled\n" +
          "  - This publisher has not published any extensions\n\n" +
          "If you are expecting some extensions to appear, please make sure you have the correct publisher ID and try again."
      );
    }

    const table = new Table({
      head: ["Extension ID", "Version", "Published"],
      style: { head: ["yellow"] },
    });
    // Order extensions newest to oldest.
    const sorted = extensions.sort(
      (a, b) => new Date(b.createTime).valueOf() - new Date(a.createTime).valueOf()
    );
    sorted.forEach((extension) => {
      table.push([
        last(extension.ref.split("/")),
        extension.latestVersion,
        extension.createTime ? extensionsUtils.formatTimestamp(extension.createTime) : "",
      ]);
    });

    logLabeledBullet(
      logPrefix,
      `list of published extensions for publisher ${clc.bold(publisherId)}:`
    );
    logger.info(table.toString());
    return { extensions: sorted };
  });
