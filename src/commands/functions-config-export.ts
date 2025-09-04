import * as path from "path";
import * as fs from "fs";
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
import * as functionsConfig from "../functionsConfig";
import { getProjectId } from "../projectUtils";
import { normalizeAndValidate } from "../functions/projectConfig";

import type { Options } from "../options";

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
          `Using project ID (${pInfo.projectId}) in the .env file header instead.`,
      );
      delete pInfo.alias;
    }
  }
}

function loadMigrationPrompt(): string {
  try {
    const promptPath = path.join(__dirname, "../../prompts/functions-config-migration.md");
    return fs.readFileSync(promptPath, "utf8");
  } catch (error: any) {
    throw new FirebaseError(`Failed to load migration prompt: ${error.message}`);
  }
}

function generateMigrationPrompt(
  firebaseConfig: any,
  categorizedConfigs: {
    definiteSecrets: Record<string, unknown>;
    likelySecrets: Record<string, unknown>;
    regularConfigs: Record<string, unknown>;
    invalidKeys: Array<{
      originalKey: string;
      suggestedKey: string;
      value: unknown;
      reason: string;
    }>;
  },
): string {
  const systemPrompt = loadMigrationPrompt();

  let invalidKeysSection = "";
  if (categorizedConfigs.invalidKeys.length > 0) {
    invalidKeysSection = `
#### ⚠️ INVALID ENVIRONMENT VARIABLE KEYS
The following config keys cannot be directly converted to environment variables:
\`\`\`json
${JSON.stringify(categorizedConfigs.invalidKeys, null, 2)}
\`\`\`

**IMPORTANT**: These keys need special handling. Use the --prefix flag or run interactively.

`;
  }

  return `${systemPrompt}

---

## Your Project Context

### firebase.json (functions section)
\`\`\`json
${JSON.stringify(firebaseConfig, null, 2)}
\`\`\`

### Runtime Configuration Analysis
${invalidKeysSection}
#### Configs marked as DEFINITE SECRETS by heuristic:
\`\`\`json
${JSON.stringify(categorizedConfigs.definiteSecrets, null, 2)}
\`\`\`

#### Configs marked as LIKELY SECRETS by heuristic:
\`\`\`json
${JSON.stringify(categorizedConfigs.likelySecrets, null, 2)}
\`\`\`

#### Configs marked as REGULAR by heuristic:
\`\`\`json
${JSON.stringify(categorizedConfigs.regularConfigs, null, 2)}
\`\`\`

---

IMPORTANT: The above classifications are based on simple pattern matching. Please review each config value and confirm with the user whether it should be treated as a secret.

Please analyze this project and guide me through the migration following the workflow above.`;
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

    const confirmed = await confirm({
      message: `Continue without importing configs from project ${pInfo.projectId}?`,
      default: true,
    });

    if (!confirmed) {
      throw new FirebaseError("Command aborted!");
    }
  }
}

export const command = new Command("functions:config:export")
  .description(
    "export environment config as environment variables in dotenv format (or generate AI migration prompt with --prompt)",
  )
  .option("--prompt", "Generate an AI migration prompt instead of exporting to .env files")
  .option("--dry-run", "Preview the export without writing files")
  .option("--prefix <prefix>", "Prefix for invalid environment variable keys (e.g., CONFIG_)")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .before(requireConfig)
  .action(async (options: Options) => {
    // Debug: Check what flags are set
    const isJsonMode = options.json === true;
    const isNonInteractive = options.nonInteractive || !process.stdout.isTTY || isJsonMode;

    // 1. Get project configs
    let pInfos = configExport.getProjectInfos(options);
    checkReservedAliases(pInfos);

    if (options.dryRun) {
      logBullet("Running in dry-run mode - no files will be written");
    }

    logBullet(
      "Importing functions configs from projects [" +
        pInfos.map(({ projectId }) => `${clc.bold(projectId)}`).join(", ") +
        "]",
    );

    await configExport.hydrateConfigs(pInfos);
    await checkRequiredPermission(pInfos);
    pInfos = pInfos.filter((pInfo) => pInfo.config);

    // 2. Handle --prompt mode early
    if (options.prompt) {
      const projectId = getProjectId(options);
      if (!projectId) {
        throw new FirebaseError(
          "Unable to determine project ID. Please specify using --project flag.",
        );
      }

      const runtimeConfig = await functionsConfig.materializeAll(projectId);
      const analysis = configExport.analyzeConfig(runtimeConfig);
      const categorizedConfigs = configExport.buildCategorizedConfigs(runtimeConfig, analysis);

      const prompt = generateMigrationPrompt(options.config.src.functions, categorizedConfigs);
      logger.info("Migration prompt generated successfully!");
      logger.info("Copy everything below and paste into your AI assistant:\n");
      console.log("=".repeat(80));
      console.log(prompt);
      console.log("=".repeat(80));
      return;
    }

    // 3. Convert configs to env vars
    let prefix = typeof options.prefix === "string" ? options.prefix : "";

    // Validate prefix if provided
    if (prefix && !/^[A-Z_]/.test(prefix)) {
      const error = `Invalid prefix "${prefix}". Prefixes must start with an uppercase letter or underscore.\nExamples: CONFIG_, APP_, MY_`;
      if (isJsonMode) {
        return {
          status: "error",
          error: error,
        };
      }
      throw new FirebaseError(error);
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (true) {
      if (attempts >= MAX_ATTEMPTS) {
        throw new FirebaseError("Exceeded max attempts to fix invalid config keys.");
      }

      const errMsg = configExport.hydrateEnvs(pInfos, prefix);
      if (errMsg.length === 0) {
        break;
      }

      // In non-interactive mode, fail if there are errors
      if (isNonInteractive) {
        // Check if the prefix itself is invalid
        let suggestion = "";
        if (prefix && !/^[A-Z_]/.test(prefix)) {
          suggestion = `\n\nYour prefix "${prefix}" is invalid. Prefixes must start with an uppercase letter or underscore.\nTry: --prefix=CONFIG_ or --prefix=APP_`;
        } else if (!prefix) {
          suggestion =
            "\n\nProvide a prefix for invalid keys using --prefix=PREFIX (e.g., --prefix=CONFIG_)";
        } else {
          suggestion = "\n\nThe prefix didn't resolve all invalid keys. Try a different prefix.";
        }

        if (isJsonMode) {
          return {
            status: "error",
            error: `Cannot export config: invalid environment variable keys found${suggestion}`,
            invalidKeys: errMsg,
          };
        }
        throw new FirebaseError(`Cannot export config:\n${errMsg}${suggestion}`);
      }

      // Interactive mode: prompt for prefix
      logWarning("The following configs keys could not be exported as environment variables:\n");
      logWarning(errMsg);
      prefix = await input({
        default: "CONFIG_",
        message:
          "Enter a PREFIX to rename invalid environment variable keys (must start with uppercase letter or _):",
        validate: (input) => {
          if (!input) {
            return "Prefix is required. Please enter a valid prefix (e.g., CONFIG_, APP_)";
          }
          if (/^[A-Z_]/.test(input)) {
            return true;
          }
          return "Prefix must start with an uppercase letter or underscore (e.g., CONFIG_, APP_)";
        },
      });
      attempts += 1;
    }

    // 4. Check for secrets
    const secretsFound: Array<{ key: string; env: string }> = [];
    for (const pInfo of pInfos) {
      if (pInfo.envs) {
        for (const env of pInfo.envs) {
          if (configExport.isLikelySecret(env.origKey)) {
            secretsFound.push({ key: env.origKey, env: env.newKey });
          }
        }
      }
    }

    // Only prompt in interactive mode (not JSON, not dry-run, not non-interactive)
    if (secretsFound.length > 0 && !options.dryRun && !isNonInteractive) {
      logWarning(
        "The following configs appear to be secrets and will be exported to .env files:\n" +
          secretsFound.map((s) => `  - ${s.key} → ${s.env}`).join("\n") +
          "\n\nConsider using Firebase Functions secrets instead: firebase functions:secrets:set",
      );

      const proceed = await confirm({
        message: "Continue exporting these potentially sensitive values?",
        default: false,
      });

      if (!proceed) {
        throw new FirebaseError("Export cancelled by user");
      }
    }

    // 5. Generate .env file contents
    const filesToWrite: Record<string, string> = {};

    for (const pInfo of pInfos) {
      if (!pInfo.envs || pInfo.envs.length === 0) continue;

      // Create project-specific header
      const projectInfo = pInfo.alias ? `${pInfo.projectId} (${pInfo.alias})` : pInfo.projectId;
      const header =
        `# Environment variables for Firebase project: ${projectInfo}\n` +
        `# Exported by firebase functions:config:export on ${new Date().toLocaleDateString()}\n` +
        `# Learn more: https://firebase.google.com/docs/functions/config-env#env-variables`;

      const filename = ".env";
      let envContent = configExport.enhancedToDotenvFormat(pInfo.envs, header);

      // Add helpful footer
      const footer =
        `\n\n# === NOTES ===\n` +
        `# - Override values: Create .env.local or .env.${pInfo.projectId}\n` +
        `# - Never commit files containing secrets\n` +
        `# - Use 'firebase functions:secrets:set' for production secrets\n` +
        `# - Learn more: https://firebase.google.com/docs/functions/config-env#env-variables`;

      envContent = envContent + footer;
      filesToWrite[filename] = envContent;
    }

    // 6. Handle output modes
    if (isJsonMode) {
      // Return JSON without writing files
      return {
        status: "success",
        result: {
          projects: pInfos.map((p) => ({
            projectId: p.projectId,
            alias: p.alias,
            configCount: p.envs?.length || 0,
          })),
          files: Object.keys(filesToWrite),
          detectedSecrets: secretsFound,
          warnings: {
            secretCount: secretsFound.length,
            message:
              secretsFound.length > 0
                ? "Detected potential secrets. Consider using 'firebase functions:secrets:set' instead of storing in .env files"
                : null,
          },
        },
      };
    }

    if (options.dryRun) {
      // Show preview without writing
      logger.info("\n🔍 DRY RUN MODE - No files will be written\n");

      // Show exactly what would be written to each file
      for (const [filename, content] of Object.entries(filesToWrite)) {
        console.log(clc.bold(clc.cyan(`=== ${filename} ===`)));
        console.log(content);
        console.log();
      }

      // Summary
      const totalConfigs = pInfos.reduce((sum, p) => sum + (p.envs?.length || 0), 0);
      const fileCount = Object.keys(filesToWrite).length;
      logger.info(
        `Summary: ${totalConfigs} configs would be exported to ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
      );
      if (secretsFound.length > 0) {
        logger.info(`${secretsFound.length} potential secrets detected (commented out for safety)`);
      }
      logger.info("\nRun without --dry-run to write .env files");
      return;
    }

    // 7. Write files
    const config = normalizeAndValidate(options.config.src.functions)[0];
    const functionsDir = config.source;

    for (const [filename, content] of Object.entries(filesToWrite)) {
      await options.config.askWriteProjectFile(path.join(functionsDir, filename), content);
    }

    // Show summary
    const totalConfigs = pInfos.reduce((sum, p) => sum + (p.envs?.length || 0), 0);
    const filesCreated = Object.keys(filesToWrite).length;

    logger.info("\nExport Summary:");
    logger.info(
      `  ${totalConfigs} config values exported to ${filesCreated} file${filesCreated !== 1 ? "s" : ""}`,
    );

    if (secretsFound.length > 0) {
      logWarning(`${secretsFound.length} potential secrets exported`);
      logger.info("\nNext steps:");
      logger.info(`  1. Review .env files for sensitive values`);
      logger.info(`  2. Move secrets to Firebase: firebase functions:secrets:set`);
      logger.info(`  3. Update your code to use the params API`);
    }
  });
