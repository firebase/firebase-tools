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

import { bold } from "cli-color";

import { logLabeledSuccess } from "../utils";
import { Command } from "../command";
import { Site, createSite } from "../hosting/api";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";

const LOG_TAG = "hosting:sites";

export const command = new Command("hosting:sites:create [siteId]")
  .description("create a Firebase Hosting site")
  .option("--app <appId>", "specify an existing Firebase Web App ID")
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .action(
    async (
      siteId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<Site> => {
      const projectId = needProjectId(options);
      const appId = options.app;
      if (!siteId) {
        if (options.nonInteractive) {
          throw new FirebaseError(
            `"siteId" argument must be provided in a non-interactive environment`
          );
        }
        siteId = await promptOnce(
          {
            type: "input",
            message: "Please provide an unique, URL-friendly id for the site (<id>.web.app):",
            validate: (s) => s.length > 0,
          } // Prevents an empty string from being submitted!
        );
      }
      if (!siteId) {
        throw new FirebaseError(`"siteId" must not be empty`);
      }

      let site: Site;
      try {
        site = await createSite(projectId, siteId, appId);
      } catch (e: any) {
        if (e.status === 409) {
          throw new FirebaseError(
            `Site ${bold(siteId)} already exists in project ${bold(projectId)}.`,
            { original: e }
          );
        }
        throw e;
      }

      logger.info();
      logLabeledSuccess(
        LOG_TAG,
        `Site ${bold(siteId)} has been created in project ${bold(projectId)}.`
      );
      if (appId) {
        logLabeledSuccess(
          LOG_TAG,
          `Site ${bold(siteId)} has been linked to web app ${bold(appId)}`
        );
      }
      logLabeledSuccess(LOG_TAG, `Site URL: ${site.defaultUrl}`);
      logger.info();
      logger.info(
        `To deploy to this site, follow the guide at https://firebase.google.com/docs/hosting/multisites.`
      );
      return site;
    }
  );
