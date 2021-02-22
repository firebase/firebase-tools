import { bold, yellow } from "cli-color";

import { logLabeledSuccess } from "../utils";
import { Command } from "../command";
import { Site, createSite } from "../hosting/api";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";
import { requirePermissions } from "../requirePermissions";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";

const LOG_TAG = "hosting:site";

export default new Command("hosting:site:create [siteName]")
  .description("create a Firebase Hosting site")
  .option("--app <appId>", "specify an existing Firebase Web App AppID")
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .action(
    async (
      siteName: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<Site> => {
      const projectId = getProjectId(options);
      const appId = options.app;
      if (!siteName) {
        if (options.nonInteractive) {
          throw new FirebaseError(
            `"siteName" argument must be provided in a non-interactive environment`
          );
        }
        siteName = await promptOnce(
          {
            type: "input",
            message: "Please provide a URL-friendly name for the site:",
            validate: (s) => s.length > 0,
          } // Prevents an empty string from being submitted!
        );
      }
      if (!siteName) {
        throw new FirebaseError(`"siteName" must not be empty`);
      }

      let site: Site;
      try {
        site = await createSite(projectId, siteName, appId);
      } catch (e) {
        if (e.status === 409) {
          throw new FirebaseError(
            `Site ${bold(siteName)} already exists on project ${bold(projectId)}. Deploy to ${bold(
              siteName
            )} with: ${yellow(`firebase deploy --only hosting:${siteName}`)}`,
            { original: e }
          );
        }
        throw e;
      }

      logger.info();
      logLabeledSuccess(
        LOG_TAG,
        `Site ${bold(siteName)} has been created in project ${bold(projectId)}.`
      );
      if (appId) {
        logLabeledSuccess(
          LOG_TAG,
          `Site ${bold(siteName)} has been linked to web app ${bold(appId)}`
        );
      }
      logLabeledSuccess(LOG_TAG, `Site URL: ${site.defaultUrl}`);
      logger.info();
      logger.info(`To deploy to this site, use \`firebase deploy --only hosting:${siteName}\`.`);
      return site;
    }
  );
