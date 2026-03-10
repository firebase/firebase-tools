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

  const supportedPlatforms = [Platform.FLUTTER, Platform.ANDROID, Platform.IOS];

  if (!platforms.some((p) => supportedPlatforms.includes(p))) {
    host.logger.debug("Found no supported App Testing platforms.");
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
