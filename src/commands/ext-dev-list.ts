/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as clc from "cli-color";
import Table = require("cli-table");

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
