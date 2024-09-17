import * as path from "path";

import * as clc from "colorette";

import requireInteractive from "../requireInteractive";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { testIamPermissions } from "../gcp/iam";
import { logger } from "../logger";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { logBullet, logWarning } from "../utils";
import { zip } from "../functional";
import * as configExport from "../functions/runtimeConfigExport";
import { requireConfig } from "../requireConfig";

import type { Options } from "../options";
import { normalizeAndValidate } from "../functions/projectConfig";

const REQUIRED_PERMISSIONS = [
  "runtimeconfig.configs.list",
  "runtimeconfig.configs.get",
  "runtimeconfig.variables.list",
  "runtimeconfig.variables.get",
];

const RESERVED_PROJECT_ALIAS = ["local"];
const MAX_ATTEMPTS = 3;

function checkReservedAliases(pInfos: configExport.ProjectConfigInfo[]): void {
  for (const pInfo of pInfos) {
    if (pInfo.alias && RESERVED_PROJECT_ALIAS.includes(pInfo.alias)) {
      logWarning(
        `Project alias (${clc.bold(pInfo.alias)}) is reserved for internal use. ` +
          `Saving exported config in .env.${pInfo.projectId} instead.`,
      );
      delete pInfo.alias;
    }
  }
}

/* For projects where we failed to fetch the runtime config, find out what permissions are missing in the project. */
async function checkRequiredPermission(pInfos: configExport.ProjectConfigInfo[]): Promise<void> {
  pInfos = pInfos.filter((pInfo) => !pInfo.config);
  const testPermissions = pInfos.map((pInfo) =>
    testIamPermissions(pInfo.projectId, REQUIRED_PERMISSIONS),
  );
  const results = await Promise.all(testPermissions);
  for (const [pInfo, result] of zip(pInfos, results)) {
    if (result.passed) {
      // We should've been able to fetch the config but couldn't. Ask the user to try export command again.
      throw new FirebaseError(
        `Unexpectedly failed to fetch runtime config for project ${pInfo.projectId}`,
      );
    }
    logWarning(
      "You are missing the following permissions to read functions config on project " +
        `${clc.bold(pInfo.projectId)}:\n\t${result.missing.join("\n\t")}`,
    );

    const confirm = await promptOnce({
      type: "confirm",
      name: "skip",
      default: true,
      message: `Continue without importing configs from project ${pInfo.projectId}?`,
    });

    if (!confirm) {
      throw new FirebaseError("Command aborted!");
    }
  }
}

async function promptForPrefix(errMsg: string): Promise<string> {
  logWarning("The following configs keys could not be exported as environment variables:\n");
  logWarning(errMsg);
  return await promptOnce(
    {
      type: "input",
      name: "prefix",
      default: "CONFIG_",
      message: "Enter a PREFIX to rename invalid environment variable keys:",
    },
    {},
  );
}

function fromEntries<V>(itr: Iterable<[string, V]>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [k, v] of itr) {
    obj[k] = v;
  }
  return obj;
}

export const command = new Command("functions:config:export")
  .description("Export environment config as environment variables in dotenv format")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .before(requireConfig)
  .before(requireInteractive)
  .action(async (options: Options) => {
    const config = normalizeAndValidate(options.config.src.functions)[0];
    const functionsDir = config.source;

    let pInfos = configExport.getProjectInfos(options);
    checkReservedAliases(pInfos);

    logBullet(
      "Importing functions configs from projects [" +
        pInfos.map(({ projectId }) => `${clc.bold(projectId)}`).join(", ") +
        "]",
    );

    await configExport.hydrateConfigs(pInfos);
    await checkRequiredPermission(pInfos);
    pInfos = pInfos.filter((pInfo) => pInfo.config);

    logger.debug(`Loaded function configs: ${JSON.stringify(pInfos)}`);
    logBullet(`Importing configs from projects: [${pInfos.map((p) => p.projectId).join(", ")}]`);

    let attempts = 0;
    let prefix = "";
    while (true) {
      if (attempts >= MAX_ATTEMPTS) {
        throw new FirebaseError("Exceeded max attempts to fix invalid config keys.");
      }

      const errMsg = configExport.hydrateEnvs(pInfos, prefix);
      if (errMsg.length === 0) {
        break;
      }
      prefix = await promptForPrefix(errMsg);
      attempts += 1;
    }

    const header = `# Exported firebase functions:config:export command on ${new Date().toLocaleDateString()}`;
    const dotEnvs = pInfos.map((pInfo) => configExport.toDotenvFormat(pInfo.envs!, header));
    const filenames = pInfos.map(configExport.generateDotenvFilename);
    const filesToWrite = fromEntries(zip(filenames, dotEnvs));
    filesToWrite[".env.local"] =
      `${header}\n# .env.local file contains environment variables for the Functions Emulator.\n`;
    filesToWrite[".env"] =
      `${header}# .env file contains environment variables that applies to all projects.\n`;

    for (const [filename, content] of Object.entries(filesToWrite)) {
      await options.config.askWriteProjectFile(path.join(functionsDir, filename), content);
    }
  });
