import { bold } from "cli-color";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { getChannel, createChannel, updateChannelTtl } from "../hosting/api";
import { normalizedHostingConfigs } from "../hosting/normalizedHostingConfigs";
import { requirePermissions } from "../requirePermissions";
import * as deploy from "../deploy";
import * as getProjectId from "../getProjectId";
import * as logger from "../logger";
import * as requireConfig from "../requireConfig";
import * as requireInstance from "../requireInstance";

interface ChannelInfo {
  target: string | null;
  site: string;
  url: string;
  expireTime: string;
}

export default new Command("hosting:channel:deploy [channelId]")
  .description("deploy to a specific Firebase Hosting channel")
  .option(
    "-e, --expires <duration>",
    "duration string (e.g. 12h, 30d) for channel expiration, max 30d"
  )
  .option("--only <target1,target2...>", "only create previews for specified targets")
  .option("--open", "open a browser to the channel after deploying")
  .option("--no-authorized-domains", "do not sync channel domains with Firebase Auth")
  .before(requireConfig)
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireInstance)
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
      // TODO: implement --expires.
      if (options.expires) {
        throw new FirebaseError("expires is not yet implemented");
      }
      // TODO: implement --no-authorized-domains.
      if (options["no-authorized-domains"]) {
        throw new FirebaseError("no-authorized-domains is not yet implemented");
      }

      // TODO: interactive prompt if channel doesn't exist
      if (!channelId) {
        throw new FirebaseError("channelID is currently required");
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
      }).map((cfg) => ({ site: cfg.site, target: cfg.target, url: "", expireTime: "" }));

      await Promise.all(
        sites.map(async (siteInfo) => {
          const site = siteInfo.site;
          let chan = await getChannel(projectId, site, channelId);
          logger.debug("[hosting] found existing channel for site", site, chan);

          if (chan) {
            chan = await updateChannelTtl(projectId, site, channelId);
            logger.debug("[hosting] updated TTL for existing channel for site", site, chan);
          } else {
            chan = await createChannel(projectId, site, channelId);
            logger.debug("[hosting] created new channnel for site", site, chan);
          }

          siteInfo.url = chan.url;
          return;
        })
      );

      await deploy(["hosting"], options, { hostingChannel: channelId });
      logger.info();

      const deploys: { [key: string]: ChannelInfo } = {};
      sites.forEach((d) => {
        deploys[d.target || d.site] = d;
        logger.info(`${bold(`Channel URL (${d.target || d.site}):`)} ${d.url}`);
      });

      return deploys;
    }
  );
