import { bold, yellow } from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";

import {
  getChannel,
  createChannel,
  updateChannelTtl,
  addAuthDomains,
  cleanAuthState,
  normalizeName,
} from "../hosting/api";
import { requirePermissions } from "../requirePermissions";
import { deploy } from "../deploy";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import { requireConfig } from "../requireConfig";
import { DEFAULT_DURATION, calculateChannelExpireTTL } from "../hosting/expireUtils";
import { logLabeledSuccess, datetimeString, logLabeledWarning, consoleUrl } from "../utils";
import { hostingConfig } from "../hosting/config";
import { marked } from "marked";
import { requireHostingSite } from "../requireHostingSite";
import { HostingOptions } from "../hosting/options";
import { Options } from "../options";

const LOG_TAG = "hosting:channel";

interface ChannelInfo {
  target?: string;
  site: string;
  url: string;
  version: string;
  expireTime: string;
}

export const command = new Command("hosting:channel:deploy [channelId]")
  .description("deploy to a specific Firebase Hosting channel")
  .option(
    "-e, --expires <duration>",
    "duration string (e.g. 12h, 30d) for channel expiration, max 30d; defaults to 7d",
  )
  .option("--only <target1,target2...>", "only create previews for specified targets")
  .option("--open", "open a browser to the channel after deploying")
  .option("--no-authorized-domains", "do not sync channel domains with Firebase Auth")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(hostingChannelDeployAction);

/**
 * Deploys to specified hosting channel.
 *
 * @param channelId ID of hosting channel to deploy to.
 * @param options Deployment options
 */
export async function hostingChannelDeployAction(
  channelId: string,
  options: Options & HostingOptions,
): Promise<{ [targetOrSite: string]: ChannelInfo }> {
  const projectId = needProjectId(options);

  // TODO: implement --open.
  if (options.open) {
    throw new FirebaseError("open is not yet implemented");
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
        yellow("firebase deploy"),
      )} instead.`,
    );
  }

  if (options.only) {
    // HACK: Re-use deploy in a rather ham-fisted way.
    options.only = options.only
      .split(",")
      .map((o: string) => `hosting:${o}`)
      .join(",");
  } else {
    // N.B. The hosting deploy code uses the only string to add all (and only)
    // functions that are pinned to the only string. If we didn't set the
    // only string here and only used the hosting deploy targets, we'd only
    // be able to deploy *all* functions.
    options.only = "hosting";
  }

  const sites: ChannelInfo[] = hostingConfig(options).map((config) => {
    return {
      target: config.target,
      site: config.site,
      url: "",
      version: "",
      expireTime: "",
    };
  });

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
          `Channel ${bold(channelId)} has been created on site ${bold(site)}.`,
        );
      }
      siteInfo.url = chan.url;
      siteInfo.expireTime = chan.expireTime;
      return;
    }),
  );

  const { hosting } = await deploy(["hosting"], options, { hostingChannel: channelId });

  // The version names are returned in the hosting key of the deploy result.
  //
  // If there is only one element it is returned as a string, otherwise it
  // is an array of strings. Not sure why it's done that way, but that's
  // something we can't change because it is in the deploy output in json.
  //
  // The code below turns it back to an array of version names.
  const versionNames: Array<string> = [];
  if (typeof hosting === "string") {
    versionNames.push(hosting);
  } else if (Array.isArray(hosting)) {
    hosting.forEach((version) => {
      versionNames.push(version);
    });
  }

  if (options.authorizedDomains) {
    await syncAuthState(projectId, sites);
  } else {
    logger.debug(`skipping syncAuthState since authorizedDomains is ${options.authorizedDomains}`);
  }

  logger.info();
  const deploys: { [key: string]: ChannelInfo } = {};
  sites.forEach((d) => {
    deploys[d.target || d.site] = d;
    let expires = "";
    if (d.expireTime) {
      expires = `[expires ${bold(datetimeString(new Date(d.expireTime)))}]`;
    }
    const versionPrefix = `sites/${d.site}/versions/`;
    const versionName = versionNames.find((v) => {
      return v.startsWith(versionPrefix);
    });
    let version = "";
    if (versionName) {
      d.version = versionName.replace(versionPrefix, "");
      version = ` [version ${bold(d.version)}]`;
    }
    logLabeledSuccess(
      LOG_TAG,
      `Channel URL (${bold(d.site || d.target || "")}): ${d.url} ${expires}${version}`,
    );
  });
  return deploys;
}
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
  } catch (e: any) {
    logLabeledWarning(
      LOG_TAG,
      marked(
        `Unable to add channel domain to Firebase Auth. Visit the Firebase Console at ${consoleUrl(
          projectId,
          "/authentication/providers",
        )}`,
      ),
    );
    logger.debug("[hosting] unable to add auth domain", e);
  }
  try {
    await cleanAuthState(projectId, siteNames);
  } catch (e: any) {
    logLabeledWarning(LOG_TAG, "Unable to sync Firebase Auth state.");
    logger.debug("[hosting] unable to sync auth domain", e);
  }
}
