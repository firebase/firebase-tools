import * as path from "path";
import * as fs from "fs";

import * as clc from "colorette";

import requireInteractive from "../requireInteractive";
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
  }
): string {
  const systemPrompt = loadMigrationPrompt();
  
  return `${systemPrompt}

---

## Your Project Context

### firebase.json (functions section)
\`\`\`json
${JSON.stringify(firebaseConfig, null, 2)}
\`\`\`

### Runtime Configuration Analysis

#### Configs marked as LIKELY SECRETS by heuristic:
\`\`\`json
${JSON.stringify(categorizedConfigs.definiteSecrets, null, 2)}
\`\`\`

#### Configs marked as POSSIBLE SECRETS by heuristic:
\`\`\`json
${JSON.stringify(categorizedConfigs.likelySecrets, null, 2)}
\`\`\`

#### Configs marked as REGULAR by heuristic:
\`\`\`json
${JSON.stringify(categorizedConfigs.regularConfigs, null, 2)}
\`\`\`

---

IMPORTANT: The above classifications are based on simple pattern matching. Please review each config value and confirm with the user whether it should be treated as a secret, especially for values marked as "POSSIBLE SECRETS".

Please analyze this project and guide me through the migration following the workflow above.`;
}

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

    const confirmed = await confirm({
      message: `Continue without importing configs from project ${pInfo.projectId}?`,
      default: true,
    });

    if (!confirmed) {
      throw new FirebaseError("Command aborted!");
    }
  }
}

async function promptForPrefix(errMsg: string): Promise<string> {
  logWarning("The following configs keys could not be exported as environment variables:\n");
  logWarning(errMsg);
  return await input({
    default: "CONFIG_",
    message: "Enter a PREFIX to rename invalid environment variable keys:",
  });
}

function fromEntries<V>(itr: Iterable<[string, V]>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [k, v] of itr) {
    obj[k] = v;
  }
  return obj;
}

function showExportSummary(pInfos: configExport.ProjectConfigInfo[], filesToWrite: Record<string, string>): void {
  const totalConfigs = pInfos.reduce((sum, p) => sum + (p.envs?.length || 0), 0);
  const filesCreated = Object.keys(filesToWrite).length;
  
  logger.info("\n📊 Export Summary:");
  logger.info(`  ✓ ${totalConfigs} config values exported`);
  logger.info(`  ✓ ${filesCreated} files created`);
  
  const secrets = pInfos.flatMap(p => 
    (p.envs || []).filter(e => configExport.isLikelySecret(e.origKey))
  );
  
  if (secrets.length > 0) {
    logger.info(`  ⚠️  ${secrets.length} potential secrets exported`);
    logger.info(`\n💡 Next steps:`);
    logger.info(`  1. Review .env files for sensitive values`);
    logger.info(`  2. Move secrets to Firebase: firebase functions:secrets:set`);
    logger.info(`  3. Update your code to use the params API`);
    logger.info(`  4. Run 'firebase functions:config:export --prompt' for migration help`);
  }
}

export const command = new Command("functions:config:export")
  .description("export environment config as environment variables in dotenv format (or generate AI migration prompt with --prompt)")
  .option("--prompt", "Generate an AI migration prompt instead of exporting to .env files")
  .option("--dry-run", "Preview the export without writing files")
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

    // If --prompt flag is set, generate migration prompt instead
    if (options.prompt) {
      logBullet("Generating AI migration prompt...");
      
      // Get the current project
      const projectId = getProjectId(options);
      if (!projectId) {
        throw new FirebaseError("Unable to determine project ID. Please specify using --project flag.");
      }
      
      // Fetch runtime config
      const runtimeConfig = await functionsConfig.materializeAll(projectId);
      
      // Analyze config for secrets
      const analysis = configExport.analyzeConfig(runtimeConfig);
      const categorizedConfigs = configExport.buildCategorizedConfigs(runtimeConfig, analysis);
      
      // Get firebase.json functions config
      const firebaseJsonFunctions = options.config.src.functions;
      
      // Generate prompt
      const prompt = generateMigrationPrompt(firebaseJsonFunctions, categorizedConfigs);
      
      // Output
      logger.info("✅ Migration prompt generated successfully!");
      logger.info("Copy everything below and paste into your AI assistant:\n");
      console.log("=".repeat(80));
      console.log(prompt);
      console.log("=".repeat(80));
      
      return;
    }

    // Otherwise, continue with existing .env export logic
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

    // Check for secrets and warn user
    const secretsFound: string[] = [];
    for (const pInfo of pInfos) {
      if (pInfo.envs) {
        for (const env of pInfo.envs) {
          if (configExport.isLikelySecret(env.origKey)) {
            secretsFound.push(`${env.origKey} → ${env.newKey}`);
          }
        }
      }
    }

    if (secretsFound.length > 0 && !options.dryRun) {
      logWarning(
        "⚠️  The following configs appear to be secrets and will be exported to .env files:\n" +
        secretsFound.map(s => `  - ${s}`).join('\n') + 
        "\n\nConsider using Firebase Functions secrets instead: firebase functions:secrets:set"
      );
      
      const proceed = await confirm({
        message: "Continue exporting these potentially sensitive values?",
        default: false
      });
      
      if (!proceed) {
        throw new FirebaseError("Export cancelled by user");
      }
    }

    // Validate config values and show warnings
    const valueWarnings = configExport.validateConfigValues(pInfos);
    if (valueWarnings.length > 0) {
      logWarning("⚠️  Value warnings:\n" + valueWarnings.map(w => `  - ${w}`).join('\n'));
    }

    const header = `# Exported firebase functions:config:export command on ${new Date().toLocaleDateString()}`;
    
    // Generate enhanced .env files with migration hints
    const filesToWrite: Record<string, string> = {};
    
    for (const pInfo of pInfos) {
      if (!pInfo.envs || pInfo.envs.length === 0) continue;
      
      const filename = configExport.generateDotenvFilename(pInfo);
      const migrationHints = configExport.addMigrationHints(pInfo.envs);
      const envContent = configExport.enhancedToDotenvFormat(pInfo.envs, header);
      
      filesToWrite[filename] = migrationHints ? `${header}\n${migrationHints}\n${envContent}` : envContent;
    }
    
    // Add default files
    filesToWrite[".env.local"] =
      `${header}\n# .env.local file contains environment variables for the Functions Emulator.\n`;
    filesToWrite[".env"] =
      `${header}\n# .env file contains environment variables that applies to all projects.\n`;

    if (options.dryRun) {
      logger.info("🔍 DRY RUN MODE - No files will be written\n");
      
      for (const [filename, content] of Object.entries(filesToWrite)) {
        console.log(clc.bold(clc.cyan(`=== ${filename} ===`)));
        console.log(content);
        console.log();
      }
      
      logger.info("✅ Dry run complete. Use without --dry-run to write files.");
    } else {
      for (const [filename, content] of Object.entries(filesToWrite)) {
        await options.config.askWriteProjectFile(path.join(functionsDir, filename), content);
      }
      
      // Show export summary
      showExportSummary(pInfos, filesToWrite);
    }
  });
