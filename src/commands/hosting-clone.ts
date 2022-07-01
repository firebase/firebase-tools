/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { bold } from "cli-color";
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import { logger } from "../logger";

export const command = new Command("hosting:clone <source> <targetChannel>")
  .description("clone a version from one site to another")
  .before(requireAuth)
  .action(async (source = "", targetChannel = "") => {
    // sites/{site}/versions/{version}
    let sourceVersionName;
    let sourceVersion;
    let [sourceSiteId, sourceChannelId] = source.split(":");
    let [targetSiteId, targetChannelId] = targetChannel.split(":");
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

    targetChannelId = normalizeName(targetChannelId);
    if (sourceChannelId) {
      sourceChannelId = normalizeName(sourceChannelId);
    }

    const equalSiteIds = sourceSiteId === targetSiteId;
    const equalChannelIds = sourceChannelId === targetChannelId;
    if (equalSiteIds && equalChannelIds) {
      throw new FirebaseError(
        `Source and destination cannot be equal. Please pick a different source or desination.`
      );
    }

    if (!sourceVersionName) {
      // verify source channel exists and get source channel
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
      try {
        tChannel = await createChannel("-", targetSiteId, targetChannelId);
      } catch (e: any) {
        throw new FirebaseError(
          `Could not create the channel ${bold(targetChannelId)} for site ${bold(targetSiteId)}.`,
          { original: e }
        );
      }
      utils.logSuccess(`Created new channel ${targetChannelId}`);
      try {
        const tProjectId = parseProjectId(tChannel.name);
        await addAuthDomains(tProjectId, [tChannel.url]);
      } catch (e: any) {
        utils.logLabeledWarning(
          "hosting:clone",
          marked(
            `Unable to add channel domain to Firebase Auth. Visit the Firebase Console at ${utils.consoleUrl(
              targetSiteId,
              "/authentication/providers"
            )}`
          )
        );
        logger.debug("[hosting] unable to add auth domain", e);
      }
    }
    const currentTargetVersionName = tChannel.release?.version?.name;

    if (equalSiteIds && sourceVersionName === currentTargetVersionName) {
      utils.logSuccess(
        `Channels ${bold(sourceChannelId)} and ${bold(
          targetChannel
        )} are serving identical versions. No need to clone.`
      );
      return;
    }

    let targetVersionName = sourceVersionName;
    const spinner = ora("Cloning site content...").start();
    try {
      if (!equalSiteIds) {
        const targetVersion = await cloneVersion(targetSiteId, sourceVersionName, true);
        if (!targetVersion) {
          throw new FirebaseError(
            `Could not clone the version ${bold(sourceVersion)} for site ${bold(targetSiteId)}.`
          );
        }
        targetVersionName = targetVersion.name;
      }
      await createRelease(targetSiteId, targetChannelId, targetVersionName);
    } catch (err: any) {
      spinner.fail();
      throw err;
    }

    spinner.succeed();
    utils.logSuccess(
      `Site ${bold(sourceSiteId)} ${sourceChannelId ? "channel" : "version"} ${bold(
        sourceChannelId || sourceVersion
      )} has been cloned to site ${bold(targetSiteId)} channel ${bold(targetChannelId)}.`
    );
    utils.logSuccess(`Channel URL (${targetChannelId}): ${tChannel.url}`);
  });

/**
 * Returns the projectId from a channel name string.
 * @param name the project scoped channel name.
 * projects/${project}/sites/${site{}/channels/${channel}
 * @return the project id.
 */
function parseProjectId(name: string): string {
  const matches = name.match(`^projects/([^/]+)`);
  return matches ? matches[1] || "" : "";
}
