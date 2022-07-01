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

import { Client } from "../apiv2";
import { Command } from "../command";
import { hostingApiOrigin } from "../api";
import { promptOnce } from "../prompt";
import { requireHostingSite } from "../requireHostingSite";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";

export const command = new Command("hosting:disable")
  .description("stop serving web traffic to your Firebase Hosting site")
  .option("-f, --force", "skip confirmation")
  .option("-s, --site <siteName>", "the site to disable")
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(async (options) => {
    const siteToDisable: string = options.site;

    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        message: `Are you sure you want to disable Firebase Hosting for the site ${clc.underline(
          siteToDisable
        )}\n${clc.underline("This will immediately make your site inaccessible!")}`,
      },
      options
    );

    if (!confirm) {
      return;
    }

    const c = new Client({ urlPrefix: hostingApiOrigin, apiVersion: "v1beta1", auth: true });
    await c.post(`/sites/${siteToDisable}/releases`, { type: "SITE_DISABLE" });

    utils.logSuccess(
      `Hosting has been disabled for ${clc.bold(siteToDisable)}. Deploy a new version to re-enable.`
    );
  });
