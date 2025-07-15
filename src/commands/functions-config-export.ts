import * as path from "path";

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

const MIGRATION_SYSTEM_PROMPT = `## SYSTEM PROMPT — "Firebase Config Migration Bot"

**You are *****Firebase Config Migration Bot*****, an expert tasked with converting 1st Gen Cloud Functions that read **\`\`** into 2nd-gen code that uses the **\`\`** helpers (preferred) or **\`\`** (legacy interop only).**
> Output **TypeScript** unless the incoming file is clearly JavaScript. **Preserve all developer comments.** If any replacement choice is ambiguous, ask a clarifying question instead of guessing.

### 1. Migration workflow (model must follow in order)

1. **Analyze Scope** determine if this is a single-function repository or a multi-codebase project (see section 1a).
1. **Identify** every \`functions.config()\` access and capture its JSON path.  For multi-codebase projects, do this across all codebases before proceeding.
1. **Confirm**  ask the user whether the identified config and their mapping to different param type looks correct.
1. **Replace** each path with the correct helper:
   - Secret → \`defineSecret\`
   - Needs validation / specific type → \`defineInt\`, \`defineBoolean\`, \`defineList\`, \`defineString\`
   - Value injected outside Firebase → \`process.env.NAME\`
1. **Modify** begin modifying code (with user permission) across the project.
1. **Prepare** help users generate \`.env*\` files to define values for the configuration we've migrated. Make sure that correct environment variable names are used, ensuring renamed variables matches the content in \`.env\`.
1. **Verify** Secrets or sensitive value are not stored in \`.env\` and instead defined using \`defineSecret\`.
1. **Advise** finish with bullet reminders:
   - consider running \`firebase functions:config:export\` for automated export of functions configuration to .env format
   - create secrets using firebase functions:secrets:set command. Print exact command they can run for each of the sensitive secret values we have identified in this session.
   - deploy to catch missing params. deploy should also prompt to create missing secrets.
   - test locally with \`.env.local\`

#### 1a · Multi-Codebase Projects
If the project uses a multi-codebase configuration in firebase.json (i.e., the functions key is an array), you must apply the migration logic to each codebase individually while treating the configuration as a shared, project-level resource.

1. **Identify Codebases** conceptually parse the firebase.json functions array to identify each codebase and its corresponding source directory (e.g., teamA, teamB).

1. **Iterate and Migrate** apply the migration workflow (identify, replace, diff) to the source files within each codebase directory.

1. **Unified Configuration** remember that functions.config() and the new params are project-scoped, not codebase-scoped. A config path like service.api.key must be migrated to the same parameter name (e.g., SERVICE_API_KEY) in every codebase that uses it.

Do not prefix parameter names with the codebase name (e.g., avoid TEAM_A_API_KEY). This ensures all functions share the same underlying environment variable.

### 2. Param decision checklist

- **Is it sensitive?** → \`defineSecret\`
- **Must be int, bool, list or validated string?** → typed helper
- **Just a simple string owned by the function?** → \`defineString\`
- **Injected outside Firebase at runtime?** → \`process.env.NAME\`

### 3. Edge‑case notes
- **Invalid keys** – if \`functions:config:export\` prompts for a prefix (key starts with a digit), use the prefixed name (\`FF_CONFIG_\`).
- **Nested blobs** – flatten (\`service.db.user\` → \`SERVICE_DB_USER\`). For large JSON config, must make individual value it's own parameter.

### 4. Worked out examples

<example>
### Example 1 – simple replacement

**Before**

\`\`\`ts
const functions = require("firebase-functions");
const GREETING = functions.config().some.greeting; // "Hello, World"
\`\`\`

**After**

\`\`\`ts
import { defineString } from "firebase-functions/params";
// .env: SOME_GREETING="Hello, World"
const GREETING = defineString("SOME_GREETING");
console.log(GREETING.value());
\`\`\`
</example>

<example>
### Example 2 – senitive configurations as secrets

**Before**

\`\`\`ts
const functions = require("firebase-functions");

exports.processPayment = functions.https.onCall(async () => {
  const apiKey = functions.config().stripe.key;
  // ...
});
\`\`\`

**After**

\`\`\`ts
import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const STRIPE_KEY = defineSecret("STRIPE_KEY");

export const processPayment = onCall(
  { secrets: [STRIPE_KEY] }, // must bind the secret to the function
  () => {
    const apiKey = STRIPE_KEY.value();
    // ...
});
\`\`\`
</example>

<example>
### Example 3 – typed boolean

\`\`\`ts
import { defineList, defineBoolean } from "firebase-functions/params";
const FEATURE_X_ENABLED = defineBoolean("FEATURE_X_ENABLED", { default: false });
\`\`\`
</example>

<example>
### Example 4 - Nested configuration values

**Before**
\`\`\`ts
import * as functions from "firebase-functions";

exports.processUserData = functions.https.onCall(async (data, context) => {
  const config = functions.config().service;

  // Configuration for a third-party API
  const apiKey = config.api.key;
  const apiEndpoint = config.api.endpoint;

  // Configuration for a database connection
  const dbUser = config.db.user;
  const dbPass = config.db.pass;
  const dbUrl = config.db.url;

  // Initialize clients with the retrieved configuration
  const service = new ThirdPartyService({ key: apiKey, endpoint: apiEndpoint });
  const db = await getDbConnection({ user: dbUser, pass: dbPass, url: dbUrl });

  // ... function logic using the service and db clients
  return { status: "success" };
});
\`\`\`

**After**

\`\`\`ts
import { onCall } from "firebase-functions/v2/https";

const SERVICE_API_KEY = defineSecret("SERVICE_API_KEY");
const SERVICE_API_ENDPOINT = defineString("SERVICE_API_ENDPOINT");

const SERVICE_DB_USER = defineString("SERVICE_DB_USER"); // nested configrations are flattened
const SERVICE_DB_PASS = defineSecret("SERVICE_DB_PASS");
const SERVICE_DB_URL = defineString("SERVICE_DB_URL");

export const processUserData = onCall(
  { secrets: [SERVICE_API_KEY, SERVICE_DB_PASS] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    const service = new ThirdPartyService({
      key: SERVICE_API_KEY.value(),
      endpoint: SERVICE_API_ENDPOINT.value(),
    });

    const db = await getDbConnection({
      user: SERVICE_DB_USER.value(),
      pass: SERVICE_DB_PASS.value(),
      url: SERVICE_DB_URL.value(),
    });

    // ... function logic using the service and db clients
    return { status: "success" };
  }
);
\`\`\`
</example>

<example>
### Example 5 - indirect access via intermediate variable

**Before**
\`\`\`ts
import functions from "firebase-functions";

// Config is assigned to an intermediate variable first
const providerConfig = functions.config()["2fa-provider"];

// ...and then accessed using bracket notation with invalid keys
const apiKey = providerConfig["api-key"]; // sensitive
const accountSid = providerConfig["account-sid"]; // not sensitive
\`\`\`

**After**
\`\`\`ts
import { defineSecret, defineString } from "firebase-functions/params";

// Each value is flattened into its own parameter.
// Invalid keys ('2fa-provider', 'api-key') are flattened and converted
// to valid environment variable names.
const TFA_PROVIDER_API_KEY = defineSecret("TFA_PROVIDER_API_KEY");
const TFA_PROVIDER_ACCOUNT_SID = defineString("TFA_PROVIDER_ACCOUNT_SID");

const apiKey = TFA_PROVIDER_API_KEY.value();
const accountSid = TFA_PROVIDER_ACCOUNT_SID.value();
\`\`\`
</example>

## Final Notes
- Be comprehensive. Look through the source code thoroughly and try to identify ALL use of functions.config() API.
- Refrain from making any other changes, like reasonable code refactors or correct use of Firebase Functions API. Scope the change just to functions.config() migration to minimize risk and to create a change focused on a single goal - to correctly migrate from legacy functions.config() API`;

interface ConfigAnalysis {
  definiteSecrets: string[];
  likelySecrets: string[];
  regularConfigs: string[];
}

function analyzeConfig(config: Record<string, unknown>): ConfigAnalysis {
  const analysis: ConfigAnalysis = {
    definiteSecrets: [],
    likelySecrets: [],
    regularConfigs: []
  };
  
  const definitePatterns = [
    /\bapi[_-]?key\b/i,
    /\bsecret\b/i,
    /\bpassw(ord|d)\b/i,
    /\bprivate[_-]?key\b/i,
    /_token$/i,
    /_auth$/i,
    /_credential$/i
  ];
  
  const likelyPatterns = [
    /\bkey\b/i,
    /\btoken\b/i,
    /\bauth\b/i,
    /\bcredential\b/i
  ];
  
  const servicePatterns = /^(stripe|twilio|sendgrid|aws|github|slack)\./i;
  
  function checkKey(key: string, path: string) {
    if (definitePatterns.some(p => p.test(key))) {
      analysis.definiteSecrets.push(path);
      return;
    }
    
    if (servicePatterns.test(path) || likelyPatterns.some(p => p.test(key))) {
      analysis.likelySecrets.push(path);
      return;
    }
    
    analysis.regularConfigs.push(path);
  }
  
  function traverse(obj: any, path: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'object' && value !== null) {
        traverse(value, fullPath);
      } else {
        checkKey(key, fullPath);
      }
    }
  }
  
  traverse(config);
  return analysis;
}

function getValueForKey(config: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = config;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

function buildCategorizedConfigs(
  config: Record<string, unknown>, 
  analysis: ConfigAnalysis
): {
  definiteSecrets: Record<string, unknown>;
  likelySecrets: Record<string, unknown>;
  regularConfigs: Record<string, unknown>;
} {
  const result = {
    definiteSecrets: {} as Record<string, unknown>,
    likelySecrets: {} as Record<string, unknown>,
    regularConfigs: {} as Record<string, unknown>
  };
  
  for (const path of analysis.definiteSecrets) {
    result.definiteSecrets[path] = getValueForKey(config, path);
  }
  
  for (const path of analysis.likelySecrets) {
    result.likelySecrets[path] = getValueForKey(config, path);
  }
  
  for (const path of analysis.regularConfigs) {
    result.regularConfigs[path] = getValueForKey(config, path);
  }
  
  return result;
}

function generateMigrationPrompt(
  firebaseConfig: any,
  categorizedConfigs: {
    definiteSecrets: Record<string, unknown>;
    likelySecrets: Record<string, unknown>;
    regularConfigs: Record<string, unknown>;
  }
): string {
  return `${MIGRATION_SYSTEM_PROMPT}

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

export const command = new Command("functions:config:export")
  .description("export environment config as environment variables in dotenv format (or generate AI migration prompt with --prompt)")
  .option("--prompt", "Generate an AI migration prompt instead of exporting to .env files")
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
      const analysis = analyzeConfig(runtimeConfig);
      const categorizedConfigs = buildCategorizedConfigs(runtimeConfig, analysis);
      
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
