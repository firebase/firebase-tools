import { bold } from "colorette";
import * as ora from "ora";

import { Command } from "../command";
import { FirebaseError } from "../error";
import {
  getChannel,
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
    `<source> and <targetChannel> accept the following format: <siteId>:<channelId>

For example, to copy the content for a site \`my-site\` from a preview channel \`staging\` to a \`live\` channel, the command would look be:

  firebase hosting:clone my-site:foo my-site:live`,
  )
  .before(requireAuth)
  .action(async (source = "", targetChannel = "", options: Options) => {
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
        `"${source}" is not a valid source. Must be in the form "<site>:<channel>" or "<site>@<version>"`,
      );
    }
    if (!targetSiteId || !targetChannelId) {
      throw new FirebaseError(
        `"${targetChannel}" is not a valid target channel. Must be in the form "<site>:<channel>" (to clone to the active website, use "live" as the channel).`,
      );
    }

    sourceProjectId = sourceProjectId || needProjectId(options);
    targetProjectId = targetProjectId || needProjectId(options);

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
          `Could not find the channel ${bold(sourceChannelId)} for site ${bold(sourceSiteId)}.`,
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
