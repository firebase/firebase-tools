import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as clc from "colorette";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";

import { Options } from "../options";

export const command = new Command("appcheck:debug:delete <appId> <tokenId>")
  .description("delete an App Check debug token")
  .option("-f, --force", "bypass confirmation prompt")
  .before(requirePermissions, ["firebaseappcheck.debugTokens.delete"])
  .action(async (appId: string, tokenId: string, options: Options) => {
    const projectId = needProjectId(options);
    await appcheck.ensureAppCheckApiEnabled(projectId, options);

    if (options.nonInteractive && !options.force) {
      throw new FirebaseError(
        `Deleting debug token ${clc.bold(tokenId)} requires confirmation.\n\n` +
          `To proceed in non-interactive mode, rerun with --force:\n\n` +
          `  firebase appcheck:debug:delete ${appId} ${tokenId} --force`,
      );
    }
    const confirmed = await confirm({
      message:
        `You are about to delete debug token ${clc.bold(tokenId)}. Environments relying on it ` +
        `will lose access to App Check-enforced backends. Are you sure?`,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmed) {
      throw new FirebaseError("Command aborted.", { exit: 1 });
    }

    await appcheck.deleteDebugToken(projectId, appId, tokenId);
    utils.logSuccess(`Deleted debug token: ${clc.bold(tokenId)}`);
  });
