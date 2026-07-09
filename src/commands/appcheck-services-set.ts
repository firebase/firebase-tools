import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as clc from "colorette";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import { Options } from "../options";

export const command = new Command("appcheck:services:set <service> <mode>")
  .description("set the App Check enforcement mode (off | unenforced | enforced) for a service")
  .option("-f, --force", "bypass confirmation prompt when enforcing")
  .before(requirePermissions, ["firebaseappcheck.services.update"])
  .action(async (service: string, mode: string, options: Options) => {
    const projectId = needProjectId(options);
    appcheck.resolveServiceId(service);
    const enforcement = appcheck.parseEnforcementMode(mode);

    await appcheck.ensureAppCheckApiEnabled(projectId, options);

    // Two confirmation-gated cases:
    //  1. Moving any service to `enforced` is client-breaking for clients that
    //     have not been updated to obtain an App Check token.
    //  2. Relaxing enforcement on an auto-enforced service (AI Logic) exposes a
    //     critical, abuse-prone API. That is discouraged, so confirm even though
    //     it is not "client-breaking".
    const relaxingAutoEnforced =
      enforcement !== "enforced" && appcheck.isAutoEnforcedService(service);

    if (enforcement === "enforced" || relaxingAutoEnforced) {
      const action = enforcement === "enforced" ? "enforced" : enforcement;
      if (options.nonInteractive && !options.force) {
        throw new FirebaseError(
          `Setting App Check on ${clc.bold(service)} to ${action} requires confirmation.\n\n` +
            `To proceed in non-interactive mode, rerun with --force:\n\n` +
            `  firebase appcheck:services:set ${service} ${enforcement} --force`,
        );
      }
      const message = relaxingAutoEnforced
        ? `${clc.bold(service)} is a critical service that Firebase enforces by default to ` +
          `protect it from abuse. Setting it to ${action} removes that protection. Continue?`
        : `Enforcing App Check on ${clc.bold(service)} will reject requests without a valid ` +
          `App Check token from clients that have not been updated to obtain one. Continue?`;
      const confirmed = await confirm({
        message,
        force: options.force,
        nonInteractive: options.nonInteractive,
      });
      if (!confirmed) {
        throw new FirebaseError("Command aborted.", { exit: 1 });
      }
    }

    const svc = await appcheck.setServiceEnforcement(projectId, service, enforcement);
    utils.logSuccess(`Set ${clc.bold(service)} enforcement to ${enforcement}.`);
    return svc;
  });
