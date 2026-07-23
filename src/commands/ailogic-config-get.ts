import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import { logger } from "../logger";

import { Options } from "../options";

// Everything `config:get` can read: the writable paths plus their group prefixes
// and the read-only provider status derived from API enablement.
const READABLE_CONFIG_PATHS = [
  "providers",
  ...ailogic.PROVIDER_TYPES.map((p) => `providers.${p}`),
  "security",
  ...ailogic.WRITABLE_CONFIG_PATHS.filter((p) => p.startsWith("security.")),
  "monitoring",
  ...ailogic.WRITABLE_CONFIG_PATHS.filter((p) => p.startsWith("monitoring.")),
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const command = new Command("ailogic:config:get [path]")
  .description("read AI Logic configuration")
  .before(requirePermissions, ["firebasevertexai.config.get", "serviceusage.services.get"])
  .action(async (path: string | undefined, options: Options) => {
    const projectId = needProjectId(options);

    // Validate the path up front so bad input fails fast, before any API calls.
    if (path) {
      ailogic.assertKnownConfigPath(path, READABLE_CONFIG_PATHS);
    }

    if (!(await ailogic.isAILogicApiEnabled(projectId))) {
      logger.info("Firebase AI Logic is not enabled on this project.");
      return;
    }
    const config = await ailogic.getConfig(projectId);

    const monitoringState = config.telemetryConfig?.mode === "ALL";
    // An unset samplingRate is displayed as 100% (full sampling).
    const sampleRatePercent =
      config.telemetryConfig?.samplingRate !== undefined
        ? ailogic.samplingRateToPercent(config.telemetryConfig.samplingRate)
        : 100;

    // Provider status needs extra Service Usage checks, so fetch it only when the
    // requested path is under `providers` (or the whole config was requested).
    const needsProviders = !path || path === "providers" || path.startsWith("providers.");
    const enabledProviders = needsProviders ? await ailogic.listProviders(projectId) : [];

    const configObj = {
      ...(needsProviders && {
        providers: Object.fromEntries(
          ailogic.PROVIDER_TYPES.map((p) => [p, enabledProviders.includes(p)]),
        ),
      }),
      security: {
        "auth-only": config.trafficFilter?.firebaseAuthRequired ?? false,
        "template-only": config.trafficFilter?.templateOnly ?? false,
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
