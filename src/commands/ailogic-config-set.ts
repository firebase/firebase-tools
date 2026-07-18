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

/** Parses a "true"/"false" flag value, throwing a FirebaseError otherwise. */
function parseBool(pathStr: string, value: string): boolean {
  if (value !== "true" && value !== "false") {
    throw new FirebaseError(`Value for ${clc.bold(pathStr)} must be 'true' or 'false'.`);
  }
  return value === "true";
}

export const command = new Command("ailogic:config:set <path> <value>")
  .description("set one configuration value")
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, ["firebasevertexai.config.update", "firebasevertexai.config.get"])
  .action(async (pathStr: string, value: string, options: Options) => {
    const projectId = needProjectId(options);

    // Validate the path up front so bad input fails fast, before the API-enablement flow.
    if (!WRITABLE_CONFIG_PATHS.includes(pathStr)) {
      throw new FirebaseError(
        `Unknown configuration path: ${pathStr}\n\nValid paths:\n\n` +
          WRITABLE_CONFIG_PATHS.map((p) => `  ${p}`).join("\n"),
      );
    }

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    if (pathStr === "security.auth-only" || pathStr === "security.template-only") {
      const boolVal = parseBool(pathStr, value);
      const isAuthOnly = pathStr === "security.auth-only";
      const trafficFilter: ailogic.TrafficFilter = isAuthOnly
        ? { firebaseAuthRequired: boolVal }
        : { templateOnly: boolVal };
      const mask = isAuthOnly ? "trafficFilter.firebaseAuthRequired" : "trafficFilter.templateOnly";

      // Tightening security from false to true is client-breaking, so confirm first.
      if (boolVal) {
        const current = await ailogic.getConfig(projectId);
        const currentVal =
          (isAuthOnly
            ? current.trafficFilter?.firebaseAuthRequired
            : current.trafficFilter?.templateOnly) ?? false;
        if (!currentVal) {
          const rejectMsg = isAuthOnly
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
      }

      await ailogic.updateConfig(projectId, { trafficFilter }, [mask]);
      utils.logSuccess(`Updated security setting: ${clc.bold(pathStr)} = ${value}`);
      return;
    }

    if (pathStr === "monitoring.state") {
      const boolVal = parseBool(pathStr, value);
      await ailogic.updateConfig(
        projectId,
        { telemetryConfig: { mode: boolVal ? "ALL" : "NONE" } },
        ["telemetryConfig.mode"],
      );
      utils.logSuccess(`Updated monitoring state: ${clc.bold(pathStr)} = ${value}`);
      return;
    }

    // monitoring.sample-rate-percentage
    const numVal = Number(value);
    if (!Number.isInteger(numVal) || numVal < 1 || numVal > 100) {
      throw new FirebaseError(
        `Value for ${clc.bold(pathStr)} must be an integer in the range 1-100.`,
      );
    }
    // The API stores the sampling rate as a fraction in (0,1]; the CLI accepts 1-100 percent.
    const samplingRate = numVal / 100;
    await ailogic.updateConfig(projectId, { telemetryConfig: { samplingRate } }, [
      "telemetryConfig.samplingRate",
    ]);
    utils.logSuccess(`Updated monitoring sample rate: ${clc.bold(pathStr)} = ${value}%`);
  });
