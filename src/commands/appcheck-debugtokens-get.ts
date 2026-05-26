import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { getDebugToken, DebugToken } from "../appcheck";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { promiseWithSpinner } from "../utils";
import { Options } from "../options";

function logDebugToken(debugToken: DebugToken): void {
  const tableHead = ["Display Name", "Resource Name", "Update Time"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  table.push([debugToken.displayName, debugToken.name, debugToken.updateTime || "N/A"]);

  logger.info(table.toString());
}

export const command = new Command("appcheck:debugtokens:get <appId> <debugTokenId>")
  .description("get metadata for a Firebase App Check debug token for an app")
  .before(requireAuth)
  .action(async (appId: string, debugTokenId: string, options: Options): Promise<DebugToken> => {
    const projectNumber = await needProjectNumber(options);

    let debugTokenName = debugTokenId;
    if (!debugTokenName.startsWith("projects/")) {
      debugTokenName = `projects/${projectNumber}/apps/${appId}/debugTokens/${debugTokenId}`;
    }

    const debugToken = await promiseWithSpinner<DebugToken>(
      async () => await getDebugToken(debugTokenName),
      `Getting App Check debug token ${clc.bold(debugTokenName)}`,
    );

    logDebugToken(debugToken);
    return debugToken;
  });
