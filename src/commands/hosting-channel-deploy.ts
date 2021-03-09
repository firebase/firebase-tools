import { bold, yellow } from "cli-color";

import { Command } from "../command";
import { FirebaseError } from "../error";

import {
  getChannel,
  createChannel,
  updateChannelTtl,
  addAuthDomains,
  cleanAuthState,
  normalizeName,
  Release,
} from "../hosting/api";
import { normalizedHostingConfigs } from "../hosting/normalizedHostingConfigs";
import { requirePermissions } from "../requirePermissions";
import * as deploy from "../deploy";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";
import { DEFAULT_DURATION, calculateChannelExpireTTL } from "../hosting/expireUtils";
import { logLabeledSuccess, datetimeString, logLabeledWarning, consoleUrl } from "../utils";
import * as marked from "marked";
import { requireHostingSite } from "../requireHostingSite";

const LOG_TAG = "hosting:channel";

interface ChannelInfo {
  target: string | null;
  site: string;
  url: string;
  version: string;
  expireTime: string;
}

interface DeployResult {
  hosting: {
    [site: string]: {
      release: Release;
    };
  };
}

export default new Command("hosting:channel:deploy [channelId]")
  .description("deploy to a specific Firebase Hosting channel")
  .option(
    "-e, --expires <duration>",
    "duration string (e.g. 12h, 30d) for channel expiration, max 30d; defaults to 7d"
  )
  .option("--only <target1,target2...>", "only create previews for specified targets")
  .option("--open", "open a browser to the channel after deploying")
  .option("--no-authorized-domains", "do not sync channel domains with Firebase Auth")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(
    async (
      channelId: string,
      options: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ): Promise<{ [targetOrSite: string]: ChannelInfo }> => {
      const projectId = getProjectId(options);

      // TODO: implement --open.
      if (options.open) {
        throw new FirebaseError("open is not yet implemented");
      }
      // TODO: implement --no-authorized-domains.
      if (options["no-authorized-domains"]) {
        throw new FirebaseError("no-authorized-domains is not yet implemented");
      }

      let expireTTL = DEFAULT_DURATION;
      if (options.expires) {
        expireTTL = calculateChannelExpireTTL(options.expires);
        logger.debug(`Expires TTL: ${expireTTL}`);
      }

      // TODO: interactive prompt if channel doesn't exist
      if (!channelId) {
        throw new FirebaseError("channelID is currently required");
      }

      channelId = normalizeName(channelId);

      // Some normalizing to be very sure of this check.
      if (channelId.toLowerCase().trim() === "live") {
        throw new FirebaseError(
          `Cannot deploy to the ${bold("live")} channel using this command. Please use ${bold(
            yellow("firebase deploy")
          )} instead.`
        );
      }

      if (options.only) {
        // HACK: Re-use deploy in a rather ham-fisted way.
        options.only = options.only
          .split(",")
          .map((o: string) => `hosting:${o}`)
          .join(",");
      }

      const sites: ChannelInfo[] = normalizedHostingConfigs(options, {
        resolveTargets: true,
      }).map((cfg) => ({
        site: cfg.site,
        target: cfg.target,
        url: "",
        version: "",
        expireTime: "",
      }));

      await Promise.all(
        sites.map(async (siteInfo) => {
          const site = siteInfo.site;
          let chan = await getChannel(projectId, site, channelId);
          if (chan) {
            logger.debug("[hosting] found existing channel for site", site, chan);
            const channelExpires = Boolean(chan.expireTime);
            if (!channelExpires && options.expires) {
              // If the channel doesn't expire, but the user provided a TTL, update the channel.
              chan = await updateChannelTtl(projectId, site, channelId, expireTTL);
            } else if (channelExpires) {
              // If the channel expires, calculate the time remaining to maybe update the channel.
              const channelTimeRemaining = new Date(chan.expireTime).getTime() - Date.now();
              // If the user explicitly gave us a time OR the time remaining is less than the new TTL:
              if (options.expires || channelTimeRemaining < expireTTL) {
                chan = await updateChannelTtl(projectId, site, channelId, expireTTL);
                logger.debug("[hosting] updated TTL for existing channel for site", site, chan);
              }
            }
          } else {
            chan = await createChannel(projectId, site, channelId, expireTTL);
            logger.debug("[hosting] created new channnel for site", site, chan);
            logLabeledSuccess(
              LOG_TAG,
              `Channel ${bold(channelId)} has been created on site ${bold(site)}.`
            );
          }
          siteInfo.url = chan.url;
          siteInfo.expireTime = chan.expireTime;
          return;
        })
      );

      const results = (await deploy(["hosting"], options, {
        hostingChannel: channelId,
      })) as DeployResult;

      logger.info();
      await syncAuthState(projectId, sites);
      const deploys: { [key: string]: ChannelInfo } = {};
      sites.forEach((d) => {
        const siteKey = d.target || d.site;
        deploys[siteKey] = d;
        let expires = "";
        if (d.expireTime) {
          expires = `[expires ${bold(datetimeString(new Date(d.expireTime)))}]`;
        }
        const siteResult = results.hosting[siteKey];
        let version = "";
        if (siteResult) {
          const versionName: string = siteResult.release.version.name;
          d.version = versionName.replace(`sites/${d.site}/versions/`, "");
          version = `[version ${bold(d.version)}]`;
        }
        logLabeledSuccess(
          LOG_TAG,
          `Channel URL (${bold(siteKey)}): ${d.url} ${expires} ${version}`
        );
      });
      return deploys;
    }
  );

/**
 * Helper function to sync authorized domains for deployed sites.
 * @param projectId the project id.
 * @param sites list of sites & url to sync auth state for.
 */
async function syncAuthState(projectId: string, sites: ChannelInfo[]) {
  const siteNames = sites.map((d) => d.site);
  const urlNames = sites.map((d) => d.url);
  try {
    await addAuthDomains(projectId, urlNames);
    logger.debug("[hosting] added auth domain for urls", urlNames);
  } catch (e) {
    logLabeledWarning(
      LOG_TAG,
      marked(
        `Unable to add channel domain to Firebase Auth. Visit the Firebase Console at ${consoleUrl(
          projectId,
          "/authentication/providers"
        )}`
      )
    );
    logger.debug("[hosting] unable to add auth domain", e);
  }
  try {
    await cleanAuthState(projectId, siteNames);
  } catch (e) {
    logLabeledWarning(LOG_TAG, "Unable to sync Firebase Auth state.");
    logger.debug("[hosting] unable to sync auth domain", e);
  }
}
