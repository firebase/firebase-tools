import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import { Options } from "../options";

/** Parses a "true"/"false" flag value (case-insensitive), throwing a FirebaseError otherwise. */
function parseBool(pathStr: string, value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized !== "true" && normalized !== "false") {
    throw new FirebaseError(`Value for ${clc.bold(pathStr)} must be 'true' or 'false'.`);
  }
  return normalized === "true";
}

// The parsed, validated change to apply. `confirm` is present only when enabling
// the setting is client-breaking and therefore needs approval before writing.
interface ConfigUpdate {
  config: Partial<ailogic.Config>;
  updateMask: string;
  normalizedValue: string;
  confirm?: {
    message: string;
    /** Whether the setting is already active, in which case no confirmation is needed. */
    isAlreadyEnabled(current: ailogic.Config): boolean;
  };
}

/**
 * Validates the path/value pair and builds the update, throwing on bad input.
 * This is the single place that maps a CLI path to its resource field.
 */
function buildUpdate(pathStr: string, value: string): ConfigUpdate {
  switch (pathStr) {
    case "security.auth-only": {
      const boolVal = parseBool(pathStr, value);
      return {
        config: { trafficFilter: { firebaseAuthRequired: boolVal } },
        updateMask: "trafficFilter.firebaseAuthRequired",
        normalizedValue: String(boolVal),
        confirm: boolVal
          ? {
              message: `Enabling ${clc.bold(pathStr)} will reject requests from unauthenticated users. Continue?`,
              isAlreadyEnabled: (current) => current.trafficFilter?.firebaseAuthRequired ?? false,
            }
          : undefined,
      };
    }
    case "security.template-only": {
      const boolVal = parseBool(pathStr, value);
      return {
        config: { trafficFilter: { templateOnly: boolVal } },
        updateMask: "trafficFilter.templateOnly",
        normalizedValue: String(boolVal),
        confirm: boolVal
          ? {
              message: `Enabling ${clc.bold(pathStr)} will reject requests not using templates. Continue?`,
              isAlreadyEnabled: (current) => current.trafficFilter?.templateOnly ?? false,
            }
          : undefined,
      };
    }
    case "monitoring.state": {
      const boolVal = parseBool(pathStr, value);
      return {
        config: { telemetryConfig: { mode: boolVal ? "ALL" : "NONE" } },
        updateMask: "telemetryConfig.mode",
        normalizedValue: String(boolVal),
      };
    }
    case "monitoring.sample-rate-percentage": {
      // Require a plain decimal integer; Number() alone would also accept
      // hex ("0x32"), scientific notation ("1e2"), and decimals ("50.0").
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) {
        throw new FirebaseError(
          `Value for ${clc.bold(pathStr)} must be an integer in the range 1-100.`,
        );
      }
      return {
        config: { telemetryConfig: { samplingRate: ailogic.percentToSamplingRate(Number(value)) } },
        updateMask: "telemetryConfig.samplingRate",
        // Number() drops leading zeros so the echo matches what was stored ("007" -> "7").
        normalizedValue: String(Number(value)),
      };
    }
    default:
      // Unreachable behind assertKnownConfigPath; kept exhaustive so a newly added
      // writable path cannot silently fall into the wrong branch.
      throw new FirebaseError(`Unknown configuration path: ${pathStr}`);
  }
}

export const command = new Command("ailogic:config:set <path> <value>")
  .description("set one configuration value")
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, [
    "firebasevertexai.config.update",
    "firebasevertexai.config.get",
    // ensureAILogicApiEnabled reads API enablement state via Service Usage.
    "serviceusage.services.get",
  ])
  .action(async (pathStr: string, value: string, options: Options) => {
    const projectId = needProjectId(options);

    // Validate the path and value up front so bad input fails fast, before the
    // API-enablement flow.
    ailogic.assertKnownConfigPath(pathStr, ailogic.WRITABLE_CONFIG_PATHS);
    const update = buildUpdate(pathStr, value);

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    // Tightening a security setting from off to on is client-breaking, so confirm first.
    if (update.confirm && !update.confirm.isAlreadyEnabled(await ailogic.getConfig(projectId))) {
      // confirm() aborts in non-interactive mode unless --force is set.
      const confirmed = await confirm({
        message: update.confirm.message,
        force: options.force,
        nonInteractive: options.nonInteractive,
      });
      if (!confirmed) {
        throw new FirebaseError("Command aborted.", { exit: 1 });
      }
    }

    await ailogic.updateConfig(projectId, update.config, [update.updateMask]);
    utils.logSuccess(`Updated ${clc.bold(pathStr)} = ${update.normalizedValue}`);
    return { path: pathStr, value: update.normalizedValue };
  });
