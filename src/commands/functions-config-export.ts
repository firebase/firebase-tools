import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as clc from "cli-color";

import requireInteractive from "../requireInteractive";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { testIamPermissions } from "../gcp/iam";
import { logger } from "../logger";
import { resolveProjectPath } from "../projectPath";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { logBullet, logWarning, logSuccess } from "../utils";
import * as configExport from "../functions/runtimeConfigExport";
import * as requireConfig from "../requireConfig";

const REQUIRED_PERMISSIONS = [
  "runtimeconfig.configs.list",
  "runtimeconfig.configs.get",
  "runtimeconfig.variables.list",
  "runtimeconfig.variables.get",
];

const RESERVED_PROJECT_ALIAS = ["local"];

function checkReservedAliases(pInfos: configExport.ProjectConfigInfo[]): void {
  for (const pInfo of pInfos) {
    if (pInfo.alias && RESERVED_PROJECT_ALIAS.includes(pInfo.alias)) {
      logWarning(
        `Project alias (${clc.bold(pInfo.alias)}) is reserved for internal use. ` +
          `Saving exported config in .env.${pInfo.projectId} instead.`
      );
      delete pInfo.alias;
    }
  }
}

/* For projects where we failed to fetch the runtime config, find out what permissions are missing in the project. */
async function checkRequiredPermission(pInfos: configExport.ProjectConfigInfo[]): Promise<void> {
  for (const pInfo of pInfos) {
    if (pInfo.config) continue;

    const result = await testIamPermissions(pInfo.projectId, REQUIRED_PERMISSIONS);
    if (result.passed) continue;

    logWarning(
      "You are missing the following permissions to read functions config on project " +
        `${clc.bold(pInfo.projectId)}:\n\t${result.missing.join("\n\t")}`
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
    {}
  );
}

async function copyFilesToDir(srcFiles: string[], destDir: string): Promise<string[]> {
  const destFiles = [];
  for (const file of srcFiles) {
    const targetFile = path.join(destDir, path.basename(file));
    if (fs.existsSync(targetFile)) {
      const overwrite = await promptOnce(
        {
          type: "confirm",
          name: "overwrite",
          default: false,
          message: `${targetFile} already exists. Overwrite file?`,
        },
        {}
      );
      if (!overwrite) {
        logBullet(`Skipping ${targetFile}`);
        continue;
      }
    }
    fs.copyFileSync(file, targetFile);
    destFiles.push(targetFile);
  }
  return destFiles;
}

export default new Command("functions:config:export")
  .description("Export environment config as environment variables in dotenv format")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .before(requireConfig)
  .before(requireInteractive)
  .action(async (options: any) => {
    let pInfos = configExport.getProjectInfos(options);
    checkReservedAliases(pInfos);

    logBullet(
      "Importing functions configs from projects [" +
        pInfos.map(({ projectId }) => `${clc.bold(projectId)}`).join(", ") +
        "]"
    );

    await configExport.hydrateConfigs(pInfos);
    await checkRequiredPermission(pInfos);
    pInfos = pInfos.filter((pInfo) => pInfo.config);

    logger.debug(`Loaded function configs: ${JSON.stringify(pInfos)}`);
    logBullet(`Importing configs from projects: [${pInfos.map((p) => p.projectId).join(", ")}]`);

    let prefix = "";
    while (true) {
      const errMsg = configExport.hydrateEnvs(pInfos, prefix);

      if (errMsg.length == 0) {
        break;
      }
      prefix = await promptForPrefix(errMsg);
    }

    const header = `# Exported firebase functions:config:export command on ${new Date().toLocaleDateString()}`;
    const tmpdir = fs.mkdtempSync(os.tmpdir() + "dotenvs");
    const tmpFiles = configExport.writeDotenvFiles(tmpdir, header, pInfos);
    // Create placeholder .env and .env.local file.
    tmpFiles.push(
      ...configExport.writeDotenvFiles(
        tmpdir,
        `${header}\n# .env.local file contains environment variables for the Functions Emulator.`,
        [{ projectId: "local" }]
      ),
      ...configExport.writeDotenvFiles(
        tmpdir,
        `${header}\n# .env file contains environment variables that applies to all projects.`,
        [{ projectId: "" }]
      )
    );
    logger.debug(`Wrote temporary .env files: [${tmpFiles.join(",")}]`);

    const functionsDir = resolveProjectPath(options, options.config.get("functions.source", "."));
    const files = await copyFilesToDir(tmpFiles, functionsDir);
    logSuccess(
      "Wrote files:\n" +
        files
          .filter((f) => f.length > 0)
          .map((f) => `\t${f}`)
          .join("\n")
    );
  });
