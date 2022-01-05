import * as clc from "cli-color";
import Table = require("cli-table");
import * as _ from "lodash";

import { Command } from "../command";
import { logPrefix } from "../extensions/extensionsHelper";
import { FirebaseError } from "../error";
import * as utils from "../utils";
import * as extensionsUtils from "../extensions/utils";
import { listExtensions } from "../extensions/extensionsApi";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";

/**
 * List all published extensions associated with this publisher ID.
 */
export default new Command("ext:dev:list <publisherId>")
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
    const sorted = _.sortBy(extensions, "createTime", "asc").reverse();
    sorted.forEach((extension) => {
      table.push([
        _.last(extension.ref.split("/")),
        extension.latestVersion,
        extension.createTime ? extensionsUtils.formatTimestamp(extension.createTime) : "",
      ]);
    });

    utils.logLabeledBullet(
      logPrefix,
      `list of published extensions for publisher ${clc.bold(publisherId)}:`
    );
    logger.info(table.toString());
    return { extensions: sorted };
  });
