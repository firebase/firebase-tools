import { bold } from "cli-color";

import { Command } from "../command";

import { requirePermissions } from "../requirePermissions";
import { FirebaseError } from "../error";
import { getChannel, createChannel } from "../hosting/api";


import * as requireConfig from "../requireConfig";
import * as requireInstance from "../requireInstance";
import * as getProjectId from "../getProjectId";



// `export default` is used for consistency in command files.
export default new Command("hosting:clone <sourceChannel> <targetChannel>")
  .description("clone a version from one site to another")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.read", "firebasehosting.sites.update"])
  .before(requireInstance)
  // .option("-e, --example <requiredValue>", "describe the option briefly")
  // .before(requireConfig) // add any necessary filters and require them above
  // .help(text) // additional help to be visible with --help or the help command
  .action(async (sourceChannel: string = "", targetChannel : string = "", options : any) => {
    const [sourceSiteId, sourceChannelId] = sourceChannel.split(":");
    const [targetSiteId, targetChannelId] = targetChannel.split(":");
    if (!sourceSiteId || !sourceChannelId) {
      throw new FirebaseError(`Please provide a sourceChannel.`);
    }
    if (!targetSiteId || !targetChannelId) {
      throw new FirebaseError(`Please provide a targetChannel.`);
    }

    const projectId = getProjectId(options);

    const sChannel = await getChannel(projectId, sourceSiteId, sourceChannelId);
    if (!sChannel) {
      throw new FirebaseError(
        `Could not find the channel ${bold(sourceChannelId)} for site ${bold(sourceSiteId)}.`
      );
    }

    let sourceVersion = sChannel.release?.version;
    if (!sourceVersion) {
      throw new FirebaseError(
        `Could not find a version on the channel ${bold(sourceChannelId)} for site ${bold(sourceSiteId)}.`
      );
    }

    let tChannel = await getChannel(projectId, targetSiteId, targetChannelId);
    if (!tChannel) {
      tChannel = await createChannel(projectId, targetSiteId, targetChannelId);
    }

      console.log("i am source channel")
      console.log(sourceChannel)
      console.log("i am target channel")
      console.log(targetChannel)
      console.log("options")
      console.log(options)
    // options will be available at e.g. options.example
    // this should return a Promise that resolves to a reasonable result
    // 1. call GetChannel on source channel. Error if it does not exist.
    // 2. call GetChannel on destination channel. Call CreateChannel if GetChannel errors.
    // 3. reterieve the version being served from the source channel object (sites/*/versions/*). Error if no version is being served on channel.
    // 4. reterieve the site name from the desitination channel object name. (sites/*)
    // 5. call cloneversion  from the destintation site with the source version info.
    // 6. block on the clone version operation until it completes
    // 7. once operation is complete a version will be returned. make a call to the CreateRelease 
    // endpoint with that new versionName so we can create a new release with type unknown? 
    // on the destinition channel.
    // 8. call UpdateChannel on destiniation channel to update it with the newly created release.
  });