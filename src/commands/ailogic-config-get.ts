import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import { logger } from "../logger";
import { FirebaseError } from "../error";

import { Options } from "../options";

// Developer-facing config paths that `config:get` can read. Provider sub-paths are
// derived from the canonical provider list so they stay in sync. Used both to
// validate the requested path and to list the valid paths in the error message.
const READABLE_CONFIG_PATHS = [
  "providers",
  ...ailogic.PROVIDER_TYPES.map((p) => `providers.${p}`),
  "security",
  "security.auth-only",
  "security.template-only",
  "monitoring",
  "monitoring.state",
  "monitoring.sample-rate-percentage",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const command = new Command("ailogic:config:get [path]")
  .description("read AI Logic configuration")
  .before(requirePermissions, ["firebasevertexai.config.get", "serviceusage.services.get"])
  .action(async (path: string | undefined, options: Options) => {
    const projectId = needProjectId(options);

    if (!(await ailogic.isAILogicApiEnabled(projectId))) {
      logger.info("Firebase AI Logic is not enabled on this project.");
      return;
    }
    const config = await ailogic.getConfig(projectId);

    const authOnly = config.trafficFilter?.firebaseAuthRequired ?? false;
    const templateOnly = config.trafficFilter?.templateOnly ?? false;
    const monitoringState = config.telemetryConfig?.mode === "ALL";
    // The API stores the sampling rate as a fraction in (0,1]; the CLI exposes it
    // as an integer percentage (1-100).
    const sampleRatePercent =
      config.telemetryConfig?.samplingRate !== undefined
        ? Math.round(config.telemetryConfig.samplingRate * 100)
        : 100;

    const enabledProviders = await ailogic.listProviders(projectId);

    const configObj = {
      providers: Object.fromEntries(
        ailogic.PROVIDER_TYPES.map((p) => [p, enabledProviders.includes(p)]),
      ),
      security: {
        "auth-only": authOnly,
        "template-only": templateOnly,
      },
      monitoring: {
        state: monitoringState,
        "sample-rate-percentage": sampleRatePercent,
      },
    };

    if (!path) {
      logger.info(JSON.stringify(configObj, null, 2));
      return configObj;
    }

    if (!READABLE_CONFIG_PATHS.includes(path)) {
      throw new FirebaseError(
        `Unknown configuration path: ${path}\n\nValid paths:\n\n` +
          READABLE_CONFIG_PATHS.map((p) => `  ${p}`).join("\n"),
      );
    }

    let val: unknown = configObj;
    for (const part of path.split(".")) {
      if (!isRecord(val)) {
        val = undefined;
        break;
      }
      val = val[part];
    }
    logger.info(typeof val === "object" ? JSON.stringify(val, null, 2) : String(val));
    return val;
  });
