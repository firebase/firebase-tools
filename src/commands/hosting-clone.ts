import { bold } from "cli-color";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { FirebaseError } from "../error";
import { getChannel, createChannel, cloneVersion, getOperation, createRelease } from "../hosting/api";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";
import * as requireInstance from "../requireInstance";
import * as getProjectId from "../getProjectId";
import { logLabeledSuccess } from "../utils";


const LOG_TAG = "hosting:clone";

export default new Command("hosting:clone <source> <targetChannel>")
  .description("clone a version from one site to another")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.read", "firebasehosting.sites.update"])
  .before(requireInstance)
  .action(async (source: string = "", targetChannel: string = "", options: any) => {
    // sites/{site}/versions/{version}
    let sourceVersionName, sourceVersion;
    let [sourceSiteId, sourceChannelId] = source.split(":");
    const [targetSiteId, targetChannelId] = targetChannel.split(":");
    if (!sourceSiteId || !sourceChannelId) {
      [sourceSiteId, sourceVersion] = source.split("@");
      if (!sourceSiteId || !sourceVersion) {
        throw new FirebaseError(`Please provide a sourceChannel.`);
      }
      sourceVersionName = `sites/${sourceSiteId}/versions/${sourceVersion}`
    }
    if (!targetSiteId || !targetChannelId) {
      throw new FirebaseError(`Please provide a targetChannel.`);
    }

    const projectId = getProjectId(options);

    if (!sourceVersionName) {
      // verify source channel exists and get source channel
      const sChannel = await getChannel(projectId, sourceSiteId, sourceChannelId);
      if (!sChannel) {
        throw new FirebaseError(
          `Could not find the channel ${bold(sourceChannelId)} for site ${bold(sourceSiteId)}.`
        );
      }
      sourceVersionName = sChannel.release?.version?.name;
      if (!sourceVersionName) {
        throw new FirebaseError(
          `Could not find a version on the channel ${bold(sourceChannelId)} for site ${bold(sourceSiteId)}.`
        );
      }
    }

    let tChannel = await getChannel(projectId, targetSiteId, targetChannelId);
    if (!tChannel) {
      logger.info(`could not find channel ${targetChannel}, creating it...`);
      tChannel = await createChannel(projectId, targetSiteId, targetChannelId);
      logger.debug("[hosting] created new channnel for site", targetSiteId, targetChannelId);
    }
    const cloneOperation = await cloneVersion(projectId, targetSiteId, sourceVersionName, true);
    if (!cloneOperation) {
      console.log(cloneOperation);
      throw new FirebaseError(
        `Could not clone the version ${bold(sourceVersion)} for site ${bold(targetSiteId)}.`
      );
    }
    const targetVersion = await getOperation(cloneOperation.name);
    await createRelease(projectId, targetSiteId, targetChannelId, targetVersion.name);

    logger.info();
    logLabeledSuccess(
      LOG_TAG,
      `Site ${sourceSiteId} ${sourceChannelId ? 'channel' : 'version'} ${sourceChannelId || sourceVersion } has been cloned to site ${targetSiteId} channel ${targetChannelId}.`
    );
    logLabeledSuccess(LOG_TAG, `Channel URL (${targetChannelId}): ${tChannel.url}`);
    logger.info();
  });