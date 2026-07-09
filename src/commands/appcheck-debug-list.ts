import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

export const command = new Command("appcheck:debug:list <appId>")
  .description("list App Check debug tokens for an app")
  .before(requirePermissions, ["firebaseappcheck.debugTokens.get"])
  .action(async (appId: string, options: Options) => {
    const projectId = needProjectId(options);

    const isEnabled = await ensureApiEnabled.check(
      projectId,
      appcheck.APP_CHECK_API,
      "appcheck",
      true,
    );
    if (!isEnabled) {
      logger.info(clc.bold(`Firebase App Check is not enabled on project ${projectId}.`));
      return [];
    }

    const tokens = await appcheck.listDebugTokens(projectId, appId);
    if (tokens.length === 0) {
      logger.info(clc.bold(`No debug tokens are configured for app ${appId}.`));
      return tokens;
    }

    const table = new Table({ head: ["Token ID", "Display Name"], style: { head: ["green"] } });
    for (const token of tokens) {
      table.push([token.name?.split("/").pop() ?? "", token.displayName]);
    }
    logger.info(table.toString());
    return tokens;
  });
