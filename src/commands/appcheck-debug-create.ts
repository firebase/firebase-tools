import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as clc from "colorette";
import * as utils from "../utils";
import { logger } from "../logger";

import { Options } from "../options";

export const command = new Command("appcheck:debug:create <appId>")
  .description("create an App Check debug token for an app")
  .option("--display-name <name>", "human-readable name for the debug token")
  .option("--token <uuid>", "supply the debug token value instead of having one generated")
  .before(requirePermissions, ["firebaseappcheck.debugTokens.create"])
  .action(async (appId: string, options: Options) => {
    const projectId = needProjectId(options);
    await appcheck.ensureAppCheckApiEnabled(projectId, options);

    const displayName =
      typeof options.displayName === "string" ? options.displayName : "CLI debug token";
    const token = typeof options.token === "string" ? options.token : undefined;
    const created = await appcheck.createDebugToken(projectId, appId, displayName, token);

    const tokenId = created.name?.split("/").pop() ?? "";
    utils.logSuccess(
      `Created debug token "${created.displayName}"${tokenId ? ` (id: ${tokenId})` : ""}.`,
    );
    logger.info(`\n  Debug token: ${clc.bold(created.token ?? "(hidden)")}\n`);
    utils.logWarning(
      "Store this value securely; it will not be shown again. It grants access to " +
        "App Check-enforced backends and must be treated as a secret.",
    );
    return created;
  });
