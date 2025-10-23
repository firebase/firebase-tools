import { appDistributionOrigin } from "../../../api";
import { getPlatformsFromFolder, Platform } from "../../../appUtils";
import { check } from "../../../ensureApiEnabled";
import { timeoutFallback } from "../../../timeout";
import { McpContext } from "../../types";

/**
 * Returns whether or not App Testing should be enabled
 */
export async function isAppTestingAvailable(ctx: McpContext): Promise<boolean> {
  const host = ctx.host;
  const projectDir = ctx.config.projectDir;
  const platforms = await getPlatformsFromFolder(projectDir);

  // If this is not a mobile app, then App Testing won't be enabled
  const supportedPlatforms = new Set([Platform.FLUTTER, Platform.ANDROID, Platform.IOS]);
  if (!supportedPlatforms.intersection(new Set(platforms)).size) {
    host.log("debug", `Found no supported App Testing platforms.`);
    return false;
  }

  // Checkf if App Distribution API is active
  try {
    return await timeoutFallback(
      check(ctx.projectId, appDistributionOrigin(), "", true),
      true,
      3000,
    );
  } catch (e) {
    // If there was a network error, default to enabling the feature
    return true;
  }
}
