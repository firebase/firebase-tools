import { bold } from "cli-color";
import { Command } from "../command";
import { FirebaseError } from "../error";
import {
  getChannel,
  createChannel,
  cloneVersion,
  getOperation,
  createRelease,
} from "../hosting/api";
import * as utils from "../utils";
import * as ora from "ora";
import { requireAuth } from "../requireAuth";

export default new Command("hosting:clone <source> <targetChannel>")
  .description("clone a version from one site to another")
  .before(requireAuth)
  .action(async (source: string = "", targetChannel: string = "", options: any) => {
    // sites/{site}/versions/{version}
    let sourceVersionName;
    let sourceVersion;
    let [sourceSiteId, sourceChannelId] = source.split(":");
    const [targetSiteId, targetChannelId] = targetChannel.split(":");
    if (!sourceSiteId || !sourceChannelId) {
      [sourceSiteId, sourceVersion] = source.split("@");
      if (!sourceSiteId || !sourceVersion) {
        throw new FirebaseError(
          `"${source}" is not a valid source. Must be in the form "<site>:<channel>" or "<site>@<version>"`
        );
      }
      sourceVersionName = `sites/${sourceSiteId}/versions/${sourceVersion}`;
    }
    if (!targetSiteId || !targetChannelId) {
      throw new FirebaseError(
        `"${targetChannel}" is not a valid target channel. Must be in the form "<site>:<channel>" (to clone to the active website, use "live" as the channel).`
      );
    }
    const equalSiteIds = sourceSiteId == targetSiteId;
    const equalChannelIds = sourceChannelId == targetChannelId;
    if (equalSiteIds && equalChannelIds) {
      throw new FirebaseError(
        `Source and destination cannot be equal. Please pick a different source or desination.`
      );
    }

    if (!sourceVersionName) {
      // verify source channel exists and get source channel
      console.log("verifying source channel");
      const sChannel = await getChannel("-", sourceSiteId, sourceChannelId);
      if (!sChannel) {
        throw new FirebaseError(
          `Could not find the channel ${bold(sourceChannelId)} for site ${bold(sourceSiteId)}.`
        );
      }
      sourceVersionName = sChannel.release?.version?.name;
      if (!sourceVersionName) {
        throw new FirebaseError(
          `Could not find a version on the channel ${bold(sourceChannelId)} for site ${bold(
            sourceSiteId
          )}.`
        );
      }
    }

    let tChannel = await getChannel("-", targetSiteId, targetChannelId);
    if (!tChannel) {
      utils.logBullet(
        `could not find channel ${bold(targetChannelId)} in site ${bold(
          targetSiteId
        )}, creating it...`
      );
      tChannel = await createChannel("-", targetSiteId, targetChannelId);
      utils.logSuccess(`Created new channel ${targetChannelId}`);
    }
    let targetVersionName = tChannel.release?.version?.name;

    if (equalSiteIds && sourceVersionName == targetVersionName) {
      utils.logSuccess(
        `Channels ${bold(sourceChannelId)} and ${bold(
          targetChannel
        )} are serving identical versions. No need to clone.`
      );
      return;
    }

    const spinner = ora("Copying over your files ...").start();
    if (equalSiteIds) {
      try {
        await createRelease(targetSiteId, targetChannelId, sourceVersionName);
      } catch (err) {
        spinner.fail();
        throw err;
      }
    } else {
      const cloneOperation = await cloneVersion(targetSiteId, sourceVersionName, true);
      if (!cloneOperation) {
        console.log(cloneOperation);
        throw new FirebaseError(
          `Could not clone the version ${bold(sourceVersion)} for site ${bold(targetSiteId)}.`
        );
      }
      try {
        const targetVersion = await getOperation(cloneOperation.name);
        await createRelease(targetSiteId, targetChannelId, targetVersion.name);
      } catch (err) {
        spinner.fail();
        throw err;
      }
    }

    spinner.succeed();
    utils.logSuccess(
      `Site ${bold(sourceSiteId)} ${sourceChannelId ? "channel" : "version"} ${bold(
        sourceChannelId || sourceVersion
      )} has been cloned to site ${bold(targetSiteId)} channel ${bold(targetChannelId)}.`
    );
    utils.logSuccess(`Channel URL (${targetChannelId}): ${tChannel.url}`);
  });
