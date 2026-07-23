import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import { Options } from "../options";

// Developer-facing config paths that `config:set` can write.
const WRITABLE_CONFIG_PATHS = [
  "security.auth-only",
  "security.template-only",
  "monitoring.state",
  "monitoring.sample-rate-percentage",
];

/** Parses a "true"/"false" flag value (case-insensitive), throwing a FirebaseError otherwise. */
function parseBool(pathStr: string, value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized !== "true" && normalized !== "false") {
    throw new FirebaseError(`Value for ${clc.bold(pathStr)} must be 'true' or 'false'.`);
  }
  return normalized === "true";
}

// The parsed, validated change to apply: the partial Config, its updateMask, and
// whether this is a security tightening (true) that requires confirmation.
interface ConfigUpdate {
  config: Partial<ailogic.Config>;
  updateMask: string;
  securityTightening: boolean;
}

/** Validates the path/value pair and builds the update, throwing on bad input. */
function buildUpdate(pathStr: string, value: string): ConfigUpdate {
  if (pathStr === "security.auth-only" || pathStr === "security.template-only") {
    const boolVal = parseBool(pathStr, value);
    const isAuthOnly = pathStr === "security.auth-only";
    return {
      config: {
        trafficFilter: isAuthOnly ? { firebaseAuthRequired: boolVal } : { templateOnly: boolVal },
      },
      updateMask: isAuthOnly ? "trafficFilter.firebaseAuthRequired" : "trafficFilter.templateOnly",
      securityTightening: boolVal,
    };
  }
  if (pathStr === "monitoring.state") {
    const boolVal = parseBool(pathStr, value);
    return {
      config: { telemetryConfig: { mode: boolVal ? "ALL" : "NONE" } },
      updateMask: "telemetryConfig.mode",
      securityTightening: false,
    };
  }
  // monitoring.sample-rate-percentage
  const numVal = Number(value);
  if (!Number.isInteger(numVal) || numVal < 1 || numVal > 100) {
    throw new FirebaseError(
      `Value for ${clc.bold(pathStr)} must be an integer in the range 1-100.`,
    );
  }
  // The API stores the sampling rate as a fraction in (0,1]; the CLI accepts 1-100 percent.
  return {
    config: { telemetryConfig: { samplingRate: numVal / 100 } },
    updateMask: "telemetryConfig.samplingRate",
    securityTightening: false,
  };
}

/** Whether tightening `pathStr` to `true` changes it from a currently-false value. */
function isTightening(pathStr: string, current: ailogic.Config): boolean {
  const currentVal =
    pathStr === "security.auth-only"
      ? current.trafficFilter?.firebaseAuthRequired
      : current.trafficFilter?.templateOnly;
  return !(currentVal ?? false);
}

export const command = new Command("ailogic:config:set <path> <value>")
  .description("set one configuration value")
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, ["firebasevertexai.config.update", "firebasevertexai.config.get"])
  .action(async (pathStr: string, value: string, options: Options) => {
    const projectId = needProjectId(options);

    // Validate the path and value up front so bad input fails fast, before the
    // API-enablement flow.
    if (!WRITABLE_CONFIG_PATHS.includes(pathStr)) {
      throw new FirebaseError(
        `Unknown configuration path: ${pathStr}\n\nValid paths:\n\n` +
          WRITABLE_CONFIG_PATHS.map((p) => `  ${p}`).join("\n"),
      );
    }
    const update = buildUpdate(pathStr, value);

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    // Tightening a security setting from false to true is client-breaking, so confirm first.
    if (update.securityTightening && isTightening(pathStr, await ailogic.getConfig(projectId))) {
      const rejectMsg =
        pathStr === "security.auth-only"
          ? "reject requests from unauthenticated users"
          : "reject requests not using templates";
      // confirm() aborts in non-interactive mode unless --force is set.
      const confirmed = await confirm({
        message: `Enabling ${clc.bold(pathStr)} will ${rejectMsg}. Continue?`,
        force: options.force,
        nonInteractive: options.nonInteractive,
      });
      if (!confirmed) {
        throw new FirebaseError("Command aborted.", { exit: 1 });
      }
    }

    await ailogic.updateConfig(projectId, update.config, [update.updateMask]);
    utils.logSuccess(`Updated ${clc.bold(pathStr)} = ${value}`);
    return { path: pathStr, value };
  });
