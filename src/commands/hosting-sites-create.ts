import { bold } from "colorette";

import { Command } from "../command.js";
import { interactiveCreateHostingSite } from "../hosting/interactive.js";
import { last, logLabeledSuccess } from "../utils.js";
import { logger } from "../logger.js";
import { needProjectId } from "../projectUtils.js";
import { Options } from "../options.js";
import { requirePermissions } from "../requirePermissions.js";
import { Site } from "../hosting/api.js";
import { FirebaseError } from "../error.js";

const LOG_TAG = "hosting:sites";

export const command = new Command("hosting:sites:create [siteId]")
  .description("create a Firebase Hosting site")
  .option("--app <appId>", "specify an existing Firebase Web App ID")
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .action(async (siteId: string, options: Options & { app: string }): Promise<Site> => {
    const projectId = needProjectId(options);
    const appId = options.app;

    if (options.nonInteractive && !siteId) {
      throw new FirebaseError(`${bold(siteId)} is required in a non-interactive environment`);
    }

    const site = await interactiveCreateHostingSite(siteId, appId, options);
    siteId = last(site.name.split("/"));

    logger.info();
    logLabeledSuccess(
      LOG_TAG,
      `Site ${bold(siteId)} has been created in project ${bold(projectId)}.`,
    );
    if (appId) {
      logLabeledSuccess(LOG_TAG, `Site ${bold(siteId)} has been linked to web app ${bold(appId)}`);
    }
    logLabeledSuccess(LOG_TAG, `Site URL: ${site.defaultUrl}`);
    logger.info();
    logger.info(
      `To deploy to this site, follow the guide at https://firebase.google.com/docs/hosting/multisites.`,
    );
    return site;
  });
