import * as clc from "cli-color";
import Table = require("cli-table");
import * as _ from "lodash";
import moment = require("moment");

import { Command } from "../command";
import { logPrefix } from "../extensions/extensionsHelper";
import { FirebaseError } from "../error";
import * as utils from "../utils";
import { listExtensions } from "../extensions/extensionsApi";
import * as logger from "../logger";
import { requireAuth } from "../requireAuth";

/**
 * List all published extensions associated with this publisher ID
 */
export default new Command("ext:dev:list [publisherId]")
  .description("list all published extensions associated with this publisher ID")
  .before(requireAuth)
  .action(async (publisherId: string, options: any) => {
    let extensions;
    try {
      extensions = await listExtensions(publisherId, false);
    } catch (err) {
      throw new FirebaseError(err);
    }

    if (extensions.length < 1) {
      return utils.logLabeledBullet(
        logPrefix,
        `there are no published extensions associated with publisher ID ${clc.bold(
          publisherId
        )}. Please make sure this publisher ID exists.`
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
        extension.createTime ? moment(extension.createTime).format("YYYY-MM-DD [T]HH:mm:ss") : "",
      ]);
    });

    utils.logLabeledBullet(
      logPrefix,
      `list of published extensions for publisher ${clc.bold(publisherId)}:`
    );
    logger.info(table.toString());
    return { extensions: sorted };
  });
