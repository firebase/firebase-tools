import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { confirm } from "../prompt";
import { FirebaseError, getErrStatus } from "../error";
import { logger } from "../logger";
import { logSuccess, logWarning } from "../utils";
import { getService, updateService } from "../appcheck/api";
import { AppCheckServiceOptions, Service } from "../appcheck/types";
import {
  AI_LOGIC_APP_CHECK_DOCS,
  AI_LOGIC_ENFORCEMENT_DATE,
  aliasForServiceId,
  assertReplayProtectionAllowed,
  confirmationForModeChange,
  isMandatoryFrom,
  parseEnforcementMode,
  resolveServiceId,
  serviceAliasHelp,
} from "../appcheck/services";

export const command = new Command("appcheck:services:set <service> <mode>")
  .description("set App Check enforcement for one service")
  .help(
    `sets the App Check enforcement mode for one service.

<service> is one of:

${serviceAliasHelp()}

<mode> is one of:

  off          App Check is not applied
  unenforced   requests are allowed, but counted in the App Check metrics
  enforced     requests without a valid App Check token are rejected

For most services the usual rollout is unenforced first, then check the metrics in the console, then enforced.

Firebase AI Logic works differently. It is enforced by default and enforcement becomes mandatory, so there is no monitoring phase: keep it enforced, use a debug token while you develop (\`appcheck:debugtokens:create\`), and register a real attestation provider before you ship (\`appcheck:providers:set\`).

--replay-protection sets the replay protection level, which cannot be stronger than <mode>. Not every service supports it.

For example:

  \`firebase appcheck:services:set firestore unenforced\`
  \`firebase appcheck:services:set firestore enforced\``,
  )
  .option(
    "--replay-protection <mode>",
    "replay protection level: off, unenforced, or enforced. Cannot be stronger than <mode>, and not every service supports it",
  )
  .option("-f, --force", "bypass confirmation prompt")
  .before(requireAuth)
  .before(requirePermissions, ["firebaseappcheck.services.get", "firebaseappcheck.services.update"])
  .action(
    async (service: string, mode: string, options: AppCheckServiceOptions): Promise<Service> => {
      // Validate everything before any network call, so bad input fails fast.
      const serviceId = resolveServiceId(service);
      const alias = aliasForServiceId(serviceId);
      const enforcementMode = parseEnforcementMode(mode);
      const replayProtection = options.replayProtection
        ? parseEnforcementMode(options.replayProtection)
        : undefined;
      if (replayProtection) {
        assertReplayProtectionAllowed(enforcementMode, replayProtection);
      }

      const projectNumber = await needProjectNumber(options);

      const current = await getService(projectNumber, serviceId);
      const question = confirmationForModeChange(
        serviceId,
        alias,
        current.enforcementMode,
        enforcementMode,
      );
      if (question) {
        // confirm() aborts in non-interactive mode unless --force is set.
        const confirmed = await confirm({
          message: question,
          force: options.force,
          nonInteractive: options.nonInteractive,
        });
        if (!confirmed) {
          throw new FirebaseError("Command aborted.", { exit: 1 });
        }
      }

      let result: Service;
      try {
        result = await updateService(projectNumber, serviceId, {
          enforcementMode,
          replayProtection,
        });
      } catch (err: unknown) {
        // Not every service supports replay protection, and the API says only
        // "Request contains an invalid argument" when one does not. Checked
        // live: AI Logic accepts it, while Firestore, Storage, Auth and Data
        // Connect all answer 400.
        if (replayProtection && getErrStatus(err) === 400) {
          throw new FirebaseError(
            `The API rejected replay protection for ${clc.bold(alias)}. Not every service supports it.\n\nRun the command again without --replay-protection to set enforcement on its own.`,
            { original: err instanceof Error ? err : undefined },
          );
        }
        throw err;
      }

      const replayText = replayProtection
        ? `, replay protection ${replayProtection.toLowerCase()}`
        : "";
      logSuccess(
        `App Check for ${clc.bold(alias)} is now ${enforcementMode.toLowerCase()}${replayText}.`,
      );
      if (enforcementMode === "UNENFORCED") {
        logger.info(`Requests without a valid token are allowed and counted in the metrics.`);
      }
      // Say it again after the write, not only in the question, so it is on
      // screen for someone who passed --force or scripted this.
      if (isMandatoryFrom(serviceId) && enforcementMode !== "ENFORCED") {
        logWarning(
          `Starting ${AI_LOGIC_ENFORCEMENT_DATE}, Firebase will automatically enforce App Check for all Gemini API requests via Firebase AI Logic, and App Check cannot be un-enforced for AI Logic. Implement App Check before this date to avoid service interruptions: ${AI_LOGIC_APP_CHECK_DOCS}`,
        );
      }

      return result;
    },
  );
