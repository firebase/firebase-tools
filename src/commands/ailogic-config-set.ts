import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as ailogic from "../gcp/ailogic";
import * as clc from "colorette";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import { Options } from "../options";

export const command = new Command("ailogic:config:set <path> <value>")
  .description("set one configuration value")
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, ["firebasevertexai.config.update", "firebasevertexai.config.get"])
  .action(async (pathStr: string, value: string, options: Options) => {
    const projectId = needProjectId(options);

    await ailogic.ensureAILogicApiEnabled(projectId, options);

    const validPaths = [
      "security.auth-only",
      "security.template-only",
      "monitoring.state",
      "monitoring.sample-rate-percentage",
    ];

    if (!validPaths.includes(pathStr)) {
      throw new FirebaseError(
        `Unknown configuration path: ${pathStr}\n\nValid paths:\n\n` +
          validPaths.map((p) => `  ${p}`).join("\n"),
      );
    }

    // Tightening check
    if (pathStr === "security.auth-only" || pathStr === "security.template-only") {
      if (value !== "true" && value !== "false") {
        throw new FirebaseError(`Value for ${clc.bold(pathStr)} must be 'true' or 'false'.`);
      }
      const boolVal = value === "true";

      if (boolVal) {
        // Fetch current config to check if it's currently false
        const currentConfig = await ailogic.getConfig(projectId);
        const currentVal =
          pathStr === "security.auth-only"
            ? currentConfig.trafficFilter?.firebaseAuthRequired ?? false
            : currentConfig.trafficFilter?.templateOnly ?? false;

        if (!currentVal) {
          const rejectMsg =
            pathStr === "security.auth-only"
              ? "reject requests from unauthenticated users"
              : "reject requests not using templates";

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

      if (pathStr === "security.auth-only") {
        await ailogic.updateConfig(
          projectId,
          {
            trafficFilter: { firebaseAuthRequired: boolVal },
          },
          ["trafficFilter.firebaseAuthRequired"],
        );
      } else {
        await ailogic.updateConfig(
          projectId,
          {
            trafficFilter: { templateOnly: boolVal },
          },
          ["trafficFilter.templateOnly"],
        );
      }
      logger.info(
        clc.green(`Successfully updated security setting: ${clc.bold(pathStr)} = ${value}`),
      );
    } else if (pathStr === "monitoring.state") {
      if (value !== "true" && value !== "false") {
        throw new FirebaseError(`Value for ${clc.bold(pathStr)} must be 'true' or 'false'.`);
      }
      const boolVal = value === "true";
      await ailogic.updateConfig(
        projectId,
        {
          telemetryConfig: { mode: boolVal ? "ALL" : "NONE" },
        },
        ["telemetryConfig.mode"],
      );
      logger.info(
        clc.green(`Successfully updated monitoring state: ${clc.bold(pathStr)} = ${value}`),
      );
    } else if (pathStr === "monitoring.sample-rate-percentage") {
      const numVal = Number(value);
      if (isNaN(numVal) || numVal <= 0 || numVal > 100) {
        throw new FirebaseError(
          `Value for ${clc.bold(pathStr)} must be a number in the range (0, 100].`,
        );
      }
      const samplingRate = numVal / 100;
      await ailogic.updateConfig(
        projectId,
        {
          telemetryConfig: { samplingRate },
        },
        ["telemetryConfig.samplingRate"],
      );
      logger.info(
        clc.green(`Successfully updated monitoring sample rate: ${clc.bold(pathStr)} = ${value}%`),
      );
    }
  });
