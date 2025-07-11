import * as path from "path";

import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { testIamPermissions } from "../gcp/iam";
import { logger } from "../logger";
import { input, confirm } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { logBullet, logWarning } from "../utils";
import { zip } from "../functional";
import * as configExport from "../functions/runtimeConfigExport";
import { requireConfig } from "../requireConfig";

import type { Options } from "../options";
import { normalizeAndValidate } from "../functions/projectConfig";
import { updateOrCreateGitignore } from "../utils";

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
async function checkRequiredPermission(
  pInfos: configExport.ProjectConfigInfo[],
  options: Options,
): Promise<void> {
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

    if (options.nonInteractive || !process.stdout.isTTY) {
      throw new FirebaseError(
        `Missing required permissions to read functions config on project ${pInfo.projectId}. ` +
          `Required permissions: ${result.missing.join(", ")}`,
        { exit: 1 },
      );
    }

    const confirmed = await confirm({
      message: `Continue without importing configs from project ${pInfo.projectId}?`,
      default: true,
    });

    if (!confirmed) {
      throw new FirebaseError("Command aborted!");
    }
  }
}

async function promptForPrefix(errMsg: string, options: Options): Promise<string> {
  logWarning("The following configs keys could not be exported as environment variables:\n");
  logWarning(errMsg);

  if (options.nonInteractive || !process.stdout.isTTY) {
    if (options.prefix) {
      return options.prefix as string;
    }
    throw new FirebaseError(
      "Cannot prompt for prefix in non-interactive mode. Please provide a prefix using the --prefix flag.",
      { exit: 1 },
    );
  }

  return await input({
    default: "CONFIG_",
    message: "Enter a PREFIX to rename invalid environment variable keys:",
  });
}

function detectPotentialSecrets(pInfos: configExport.ProjectConfigInfo[]): configExport.EnvMap[] {
  const secretPatterns = /SECRET|TOKEN|KEY|PASSWORD|API_KEY|PRIVATE|CREDENTIAL/i;
  const highEntropyPattern = /^[a-zA-Z0-9\-_]{32,}$/;

  const allSecrets: configExport.EnvMap[] = [];

  for (const pInfo of pInfos) {
    if (pInfo.envs) {
      const secrets = pInfo.envs.filter(
        (env) =>
          secretPatterns.test(env.newKey) || (env.value && highEntropyPattern.test(env.value)),
      );
      allSecrets.push(...secrets);
    }
  }

  return allSecrets;
}

async function handleGitignore(
  functionsDir: string,
  hasSecrets: boolean,
  options: Options,
): Promise<void> {
  if (options.nonInteractive || !process.stdout.isTTY) {
    if (hasSecrets) {
      logWarning(
        "Detected potential secrets in .env files. Consider adding '.env*' to your .gitignore file.",
      );
    }
    return;
  }

  const message = hasSecrets
    ? "Detected potential secrets. Would you like to add '.env*' to your .gitignore to prevent committing sensitive data?"
    : "Would you like to add '.env*' to your .gitignore to prevent committing .env files?";

  const shouldUpdate =
    hasSecrets ||
    (await confirm({
      message,
      default: hasSecrets,
    }));

  if (shouldUpdate) {
    updateOrCreateGitignore(functionsDir, [".env*"]);
    logBullet("Added .env* to .gitignore");
  }
}

export const command = new Command("functions:config:export")
  .description("export environment config as environment variables in dotenv format")
  .option(
    "--prefix <prefix>",
    "Prefix for invalid environment variable keys (for non-interactive mode)",
  )
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .before(requireConfig)
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
    await checkRequiredPermission(pInfos, options);
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
      prefix = await promptForPrefix(errMsg, options);
      attempts += 1;
    }

    const header = `# Exported firebase functions:config:export command on ${new Date().toLocaleDateString()}`;
    const dotEnvs = pInfos.map((pInfo) => configExport.toDotenvFormat(pInfo.envs!, header));
    const filenames = pInfos.map(configExport.generateDotenvFilename);
    const filesToWrite = Object.fromEntries(zip(filenames, dotEnvs));
    filesToWrite[".env.local"] =
      `${header}\n# .env.local file contains environment variables for the Functions Emulator.\n`;
    filesToWrite[".env"] =
      `${header}\n# .env file contains environment variables that applies to all projects.\n`;

    for (const [filename, content] of Object.entries(filesToWrite)) {
      await options.config.askWriteProjectFile(path.join(functionsDir, filename), content);
    }

    // Detect potential secrets and warn the user
    const potentialSecrets = detectPotentialSecrets(pInfos);
    if (potentialSecrets.length > 0) {
      logWarning(
        `${clc.bold("SECURITY WARNING:")} Found potential secrets in your exported configuration:`,
      );
      const uniqueSecrets = [...new Set(potentialSecrets.map((s) => s.newKey))];
      uniqueSecrets.slice(0, 10).forEach((key) => logWarning(`  - ${key}`));
      if (uniqueSecrets.length > 10) {
        logWarning(`  ... and ${uniqueSecrets.length - 10} more`);
      }
      logWarning(
        "We strongly recommend you remove these from your .env files and store them securely in Secret Manager before committing your code.",
      );
    }

    // Handle .gitignore update
    await handleGitignore(functionsDir, potentialSecrets.length > 0, options);
  });
