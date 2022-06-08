import clccolor from "cli-color";
const { bold, yellow } = clccolor;

import { logLabeledSuccess } from "../utils.js";
import { Command } from "../command.js";
import { Site, createSite } from "../hosting/api.js";
import { promptOnce } from "../prompt.js";
import { FirebaseError } from "../error.js";
import { requirePermissions } from "../requirePermissions.js";
import { needProjectId } from "../projectUtils.js";
import { logger } from "../logger.js";

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
