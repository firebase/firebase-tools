import { McpContext, ServerFeature } from "../types";
import { checkFeatureActive } from "../util";
import { isCrashlyticsAvailable } from "./crashlytics/availability";
import { isAppTestingAvailable } from "./apptesting/availability";

const DEFAULT_AVAILABILITY_CHECKS: Record<ServerFeature, (ctx: McpContext) => Promise<boolean>> = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  core: async (ctx: McpContext): Promise<boolean> => true,
  firestore: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("firestore", ctx.projectId, { config: ctx.config }),
  storage: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("storage", ctx.projectId, { config: ctx.config }),
  dataconnect: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("dataconnect", ctx.projectId, { config: ctx.config }),
  auth: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("auth", ctx.projectId, { config: ctx.config }),
  messaging: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("messaging", ctx.projectId, { config: ctx.config }),
  functions: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("functions", ctx.projectId, { config: ctx.config }),
  remoteconfig: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("remoteconfig", ctx.projectId, { config: ctx.config }),
  crashlytics: isCrashlyticsAvailable,
  apphosting: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("apphosting", ctx.projectId, { config: ctx.config }),
  apptesting: isAppTestingAvailable,
  database: (ctx: McpContext): Promise<boolean> =>
    checkFeatureActive("database", ctx.projectId, { config: ctx.config }),
};

/**
 * Returns the default availability function for a ServerFeature.
 */
export function getDefaultFeatureAvailabilityCheck(
  feature: ServerFeature,
): (ctx: McpContext) => Promise<boolean> {
  return DEFAULT_AVAILABILITY_CHECKS[feature];
}
