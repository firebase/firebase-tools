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

import { bold, underline } from "cli-color";
import { Command } from "../command";
import { logLabeledSuccess } from "../utils";
import { getSite, deleteSite } from "../hosting/api";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { requireConfig } from "../requireConfig";
import { logger } from "../logger";

const LOG_TAG = "hosting:sites";

export const command = new Command("hosting:sites:delete <siteId>")
  .description("delete a Firebase Hosting site")
  .withForce()
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.delete"])
  .action(
    async (
      siteId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<void> => {
      const projectId = needProjectId(options);
      if (!siteId) {
        throw new FirebaseError("siteId is required");
      }
      logger.info(
        `Deleting a site is a permanent action. If you delete a site, Firebase doesn't maintain records of deployed files or deployment history, and the site ${underline(
          siteId
        )} cannot be reactivated by you or anyone else.`
      );
      logger.info();

      const confirmed = await promptOnce(
        {
          name: "force",
          type: "confirm",
          message: `Are you sure you want to delete the Hosting site ${underline(
            siteId
          )} for project ${underline(projectId)}? `,
          default: false,
        },
        options
      );
      if (!confirmed) {
        return;
      }

      // Check that the site exists first, to avoid giving a sucessesful message on a non-existant site.
      await getSite(projectId, siteId);
      await deleteSite(projectId, siteId);
      logLabeledSuccess(
        LOG_TAG,
        `Successfully deleted site ${bold(siteId)} from project ${bold(projectId)}`
      );
    }
  );
