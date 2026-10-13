import { bold } from "colorette";
import * as ora from "ora";

import { Command } from "../command";
import { FirebaseError } from "../error";
import {
  getChannel,
  getSite,
  createChannel,
  cloneVersion,
  createRelease,
  addAuthDomains,
  normalizeName,
} from "../hosting/api";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";

export const command = new Command("hosting:clone <source> <targetChannel>")
  .description("clone a version from one site to another")
  .help(
    `<source> and <targetChannel> accept the following formats:
  - [<projectId>:]<siteId>:<channelId>
  - [<projectId>:]<siteId>@<versionId> (source only)

Site projects are automatically discovered if omitted.

For example, to copy the content for a site \`my-site\` from a preview channel \`staging\` to a \`live\` channel:

  firebase hosting:clone my-site:staging my-site:live

To clone across different Firebase projects:

  firebase hosting:clone site-a:live site-b:live --project=project-b
  # or explicitly:
  firebase hosting:clone project-a:site-a:live project-b:site-b:live`,
  )
  .before(requireAuth)
  .action(async (source: string, targetChannel: string, options: Options) => {
    source = source || "";
    targetChannel = targetChannel || "";
    let sourceProjectId: string | undefined;
    let sourceSiteId: string | undefined;
    let sourceChannelId: string | undefined;
    let sourceVersion: string | undefined;

    if (source.includes("@")) {
      const [sitePart, version] = source.split("@");
      sourceVersion = version;
      if (sitePart.includes(":")) {
        [sourceProjectId, sourceSiteId] = sitePart.split(":");
      } else {
        sourceSiteId = sitePart;
      }
    } else {
      const parts = source.split(":");
      if (parts.length === 3) {
        [sourceProjectId, sourceSiteId, sourceChannelId] = parts;
      } else if (parts.length === 2) {
        [sourceSiteId, sourceChannelId] = parts;
      }
    }

    let targetProjectId: string | undefined;
    let targetSiteId: string | undefined;
    let targetChannelId: string | undefined;

    const targetParts = targetChannel.split(":");
    if (targetParts.length === 3) {
      [targetProjectId, targetSiteId, targetChannelId] = targetParts;
    } else if (targetParts.length === 2) {
      [targetSiteId, targetChannelId] = targetParts;
    }

    if (!sourceSiteId || (!sourceChannelId && !sourceVersion)) {
      throw new FirebaseError(
        `"${source}" is not a valid source. Must be in the form "[<project>:]<site>:<channel>" or "[<project>:]<site>@<version>"`,
      );
    }
    if (!targetSiteId || !targetChannelId) {
      throw new FirebaseError(
        `"${targetChannel}" is not a valid target channel. Must be in the form "[<project>:]<site>:<channel>" (to clone to the active website, use "live" as the channel).`,
      );
    }

    [sourceProjectId, targetProjectId] = await Promise.all([
      resolveProjectId(sourceSiteId, sourceProjectId, options),
      resolveProjectId(targetSiteId, targetProjectId, options),
    ]);

    targetChannelId = normalizeName(targetChannelId);
    if (sourceChannelId) {
      sourceChannelId = normalizeName(sourceChannelId);
    }

    const equalProjectIds = sourceProjectId === targetProjectId;
    const equalSiteIds = sourceSiteId === targetSiteId;
    const equalChannelIds = sourceChannelId === targetChannelId;
    if (equalProjectIds && equalSiteIds && equalChannelIds) {
      throw new FirebaseError(
        `Source and destination cannot be equal. Please pick a different source or destination.`,
      );
    }

    let sourceVersionName: string | undefined;
    if (sourceVersion) {
      sourceVersionName = `projects/${sourceProjectId}/sites/${sourceSiteId}/versions/${sourceVersion}`;
    } else if (sourceChannelId) {
      // verify source channel exists and get source channel
      const sChannel = await getChannel(sourceProjectId, sourceSiteId, sourceChannelId);
      if (!sChannel) {
        throw new FirebaseError(
          `Could not find the channel ${bold(sourceChannelId)} for site ${bold(
            sourceSiteId,
          )} in project ${bold(sourceProjectId)}.`,
        );
      }
      sourceVersionName = sChannel.release?.version?.name;
      if (!sourceVersionName) {
        throw new FirebaseError(
          `Could not find a version on the channel ${bold(sourceChannelId)} for site ${bold(
            sourceSiteId,
          )}.`,
        );
      }
    }

    if (!sourceVersionName) {
      throw new FirebaseError(`Could not find a version to clone for site ${bold(sourceSiteId)}.`);
    }

    let tChannel = await getChannel(targetProjectId, targetSiteId, targetChannelId);
    if (!tChannel) {
      utils.logBullet(
        `could not find channel ${bold(targetChannelId)} in site ${bold(
          targetSiteId,
        )}, creating it...`,
      );
      try {
        tChannel = await createChannel(targetProjectId, targetSiteId, targetChannelId);
      } catch (e: any) {
        throw new FirebaseError(
          `Could not create the channel ${bold(targetChannelId)} for site ${bold(targetSiteId)}.`,
          { original: e },
        );
      }
      utils.logSuccess(`Created new channel ${targetChannelId}`);
      try {
        await addAuthDomains(targetProjectId, [tChannel.url]);
      } catch (e: any) {
        utils.logLabeledWarning(
          "hosting:clone",
          `Unable to add channel domain to Firebase Auth. Visit the Firebase Console at ${utils.consoleUrl(
            targetProjectId,
            "/authentication/providers",
          )}`,
        );
        logger.debug("[hosting] unable to add auth domain", e);
      }
    }
    const currentTargetVersionName = tChannel.release?.version?.name;

    if (equalProjectIds && equalSiteIds && sourceVersionName === currentTargetVersionName) {
      utils.logSuccess(
        `Channels ${bold(sourceChannelId || sourceVersion || "")} and ${bold(
          targetChannel,
        )} are serving identical versions. No need to clone.`,
      );
      return;
    }

    let targetVersionName = sourceVersionName;
    const spinner = ora("Cloning site content...").start();
    try {
      if (!equalSiteIds || !equalProjectIds) {
        const targetVersion = await cloneVersion(
          targetProjectId,
          targetSiteId,
          sourceVersionName,
          true,
        );
        if (!targetVersion) {
          throw new FirebaseError(
            `Could not clone the version ${bold(sourceVersion || sourceVersionName)} for site ${bold(targetSiteId)}.`,
          );
        }
        targetVersionName = targetVersion.name;
      }
      await createRelease(targetProjectId, targetSiteId, targetChannelId, targetVersionName);
    } catch (err: any) {
      spinner.fail();
      throw err;
    }

    spinner.succeed();
    utils.logSuccess(
      `Site ${bold(sourceSiteId)} ${sourceChannelId ? "channel" : "version"} ${bold(
        sourceChannelId || sourceVersion || sourceVersionName,
      )} has been cloned to site ${bold(targetSiteId)} channel ${bold(targetChannelId)}.`,
    );
    utils.logSuccess(`Channel URL (${targetChannelId}): ${tChannel.url}`);
  });

/**
 * Returns the projectId from a resource name string.
 * projects/${project}/sites/${site}...
 * @param name the project scoped resource name.
 * @return the project id.
 */
function parseProjectId(name: string): string {
  const matches = /^projects\/([^/]+)/.exec(name);
  return matches ? matches[1] || "" : "";
}

/**
 * Resolves the project ID for a site, looking up the site with "-" wildcard if unspecified.
 * @param siteId the site ID.
 * @param explicitProjectId the explicitly provided project ID, if any.
 * @param options the command options.
 * @return the resolved project ID.
 */
async function resolveProjectId(
  siteId: string,
  explicitProjectId: string | undefined,
  options: Options,
): Promise<string> {
  if (explicitProjectId) {
    return explicitProjectId;
  }
  try {
    const site = await getSite("-", siteId);
    const projectId = parseProjectId(site.name);
    if (projectId) {
      return projectId;
    }
  } catch (e: unknown) {
    if (e instanceof FirebaseError && e.status === 404) {
      throw new FirebaseError(`Could not find the site ${bold(siteId)}.`, {
        original: e,
        status: 404,
      });
    }
    logger.debug(`[hosting] unable to resolve project for site ${siteId} via site lookup:`, e);
  }
  return needProjectId(options);
}
