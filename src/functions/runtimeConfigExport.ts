import * as clc from "colorette";

import * as env from "./env";
import * as functionsConfig from "../functionsConfig";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { getProjectId } from "../projectUtils";
import { loadRC } from "../rc";
import { logWarning } from "../utils";
import { flatten } from "../functional";

export interface ProjectConfigInfo {
  projectId: string;
  alias?: string;
  config?: Record<string, unknown>;
  envs?: EnvMap[];
}

export interface EnvMap {
  origKey: string;
  newKey: string;
  value: string;
  err?: string;
}

export interface ConfigToEnvResult {
  success: EnvMap[];
  errors: Required<EnvMap>[];
}

/**
 * Find all projects (and its alias) associated with the current directory.
 */
export function getProjectInfos(options: {
  project?: string;
  projectId?: string;
  cwd?: string;
}): ProjectConfigInfo[] {
  const result: Record<string, string> = {};

  const rc = loadRC(options);
  if (rc.projects) {
    for (const [alias, projectId] of Object.entries(rc.projects)) {
      if (Object.keys(result).includes(projectId)) {
        logWarning(
          `Multiple aliases found for ${clc.bold(projectId)}. ` +
            `Preferring alias (${clc.bold(result[projectId])}) over (${clc.bold(alias)}).`,
        );
        continue;
      }
      result[projectId] = alias;
    }
  }

  // We export runtime config of a --project set via CLI flag, allowing export command to run on projects that's
  // never been added to the .firebaserc file.
  const projectId = getProjectId(options);
  if (projectId && !Object.keys(result).includes(projectId)) {
    result[projectId] = projectId;
  }

  return Object.entries(result).map(([k, v]) => {
    const result: ProjectConfigInfo = { projectId: k };
    if (k !== v) {
      result.alias = v;
    }
    return result;
  });
}

/**
 * Fetch and fill in runtime config for each project.
 */
export async function hydrateConfigs(pInfos: ProjectConfigInfo[]): Promise<void> {
  const hydrate = pInfos.map((info) => {
    return functionsConfig
      .materializeAll(info.projectId)
      .then((config) => {
        info.config = config;
        return;
      })
      .catch((err) => {
        logger.debug(
          `Failed to fetch runtime config for project ${info.projectId}: ${err.message}`,
        );
      });
  });
  await Promise.all(hydrate);
}

/**
 * Converts functions config key from runtime config to env var key.
 * If the original config key fails to convert, try again with provided prefix.
 *
 * Throws KeyValidationError if the converted key is invalid.
 */
export function convertKey(configKey: string, prefix: string): string {
  /* prettier-ignore */
  const baseKey = configKey
      .toUpperCase()       // 1. Uppercase all characters (e.g. SOME-SERVICE.KEY)
      .replace(/\./g, "_") // 2. Dots to underscores (e.g. SOME-SERVICE_KEY)
      .replace(/-/g, "_"); // 3. Dashses to underscores (e.g. SOME_SERVICE_KEY)

  let envKey = baseKey;
  try {
    env.validateKey(envKey);
  } catch (err: any) {
    if (err instanceof env.KeyValidationError) {
      envKey = prefix + envKey;
      env.validateKey(envKey);
    }
  }
  return envKey;
}

/**
 * Convert runtime config into a map of env vars.
 */
export function configToEnv(configs: Record<string, unknown>, prefix: string): ConfigToEnvResult {
  const success = [];
  const errors = [];

  for (const [configKey, value] of flatten(configs)) {
    try {
      const envKey = convertKey(configKey, prefix);
      success.push({ origKey: configKey, newKey: envKey, value: value as string });
    } catch (err: any) {
      if (err instanceof env.KeyValidationError) {
        errors.push({
          origKey: configKey,
          newKey: err.key,
          err: err.message,
          value: value as string,
        });
      } else {
        throw new FirebaseError("Unexpected error while converting config", {
          exit: 2,
          original: err,
        });
      }
    }
  }
  return { success, errors };
}

/**
 * Fill in environment variables for each project by converting project's runtime config.
 *
 * @return {ConfigToEnvResult} Collection of successful and errored conversion.
 */
export function hydrateEnvs(pInfos: ProjectConfigInfo[], prefix: string): string {
  let errMsg = "";
  for (const pInfo of pInfos) {
    const { success, errors } = configToEnv(pInfo.config!, prefix);
    if (errors.length > 0) {
      const msg =
        `${pInfo.projectId} ` +
        `${pInfo.alias ? "(" + pInfo.alias + ")" : ""}:\n` +
        errors.map((err) => `\t${err.origKey} => ${clc.bold(err.newKey)} (${err.err})`).join("\n") +
        "\n";
      errMsg += msg;
    } else {
      pInfo.envs = success;
    }
  }
  return errMsg;
}

const CHARACTERS_TO_ESCAPE_SEQUENCES: Record<string, string> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\v": "\\v",
  "\\": "\\\\",
  '"': '\\"',
  "'": "\\'",
};

function escape(s: string): string {
  // Escape newlines, tabs, backslashes and quotes
  return s.replace(/[\n\r\t\v\\"']/g, (ch) => CHARACTERS_TO_ESCAPE_SEQUENCES[ch]);
}

/**
 * Convert env var mapping to  dotenv compatible string.
 */
export function toDotenvFormat(envs: EnvMap[], header = ""): string {
  const lines = envs.map(({ newKey, value }) => `${newKey}="${escape(value)}"`);
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  return (
    `${header}\n` +
    lines.map((line, idx) => `${line.padEnd(maxLineLen)} # from ${envs[idx].origKey}`).join("\n")
  );
}

/**
 * Generate dotenv filename for given project.
 */
export function generateDotenvFilename(pInfo: ProjectConfigInfo): string {
  return `.env.${pInfo.alias ?? pInfo.projectId}`;
}

export interface ConfigAnalysis {
  definiteSecrets: string[];
  likelySecrets: string[];
  regularConfigs: string[];
}

/**
 * Check if a config key is likely to be a secret based on common patterns.
 */
export function isLikelySecret(key: string): boolean {
  const secretPatterns = [
    /\bapi[_-]?key\b/i,
    /\bsecret\b/i,
    /\bpassw(ord|d)\b/i,
    /\bprivate[_-]?key\b/i,
    /_token$/i,
    /_auth$/i,
    /_credential$/i,
    /\bkey\b/i,
    /\btoken\b/i,
    /\bauth\b/i,
    /\bcredential\b/i
  ];
  
  return secretPatterns.some(pattern => pattern.test(key));
}

/**
 * Analyze config keys to categorize them as secrets, likely secrets, or regular configs.
 */
export function analyzeConfig(config: Record<string, unknown>): ConfigAnalysis {
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

/**
 * Get enhanced comment for env var with type hints and secret warnings.
 */
export function getEnhancedComment(origKey: string, value: string): string {
  const parts = [`from ${origKey}`];
  
  // Add type hint
  if (value === "true" || value === "false") {
    parts.push("[boolean]");
  } else if (!isNaN(Number(value)) && value !== "") {
    parts.push("[number]");
  } else if (value.includes(",")) {
    parts.push("[possible list]");
  }
  
  // Add secret warning
  if (isLikelySecret(origKey)) {
    parts.push("⚠️ LIKELY SECRET");
  }
  
  return parts.length > 1 ? ` # ${parts.join(" ")}` : ` # ${parts[0]}`;
}

/**
 * Convert env var mapping to enhanced dotenv format with type hints and aligned comments.
 */
export function enhancedToDotenvFormat(envs: EnvMap[], header = ""): string {
  const lines = envs.map(({ newKey, value, origKey }) => {
    const comment = getEnhancedComment(origKey, value);
    return `${newKey}="${escape(value)}"${comment}`;
  });
  
  // Calculate max line length for alignment
  const maxLineLen = Math.max(...lines.map(l => l.indexOf(" #")));
  const alignedLines = lines.map(line => {
    const commentIndex = line.indexOf(" #");
    const padding = " ".repeat(Math.max(0, maxLineLen - commentIndex));
    return line.replace(" #", padding + " #");
  });
  
  return `${header}\n${alignedLines.join('\n')}`;
}

/**
 * Generate migration hints for env files based on detected patterns.
 */
export function addMigrationHints(envs: EnvMap[]): string {
  const hints: string[] = [];
  
  const secrets = envs.filter(e => isLikelySecret(e.origKey));
  const booleans = envs.filter(e => e.value === "true" || e.value === "false");
  const numbers = envs.filter(e => !isNaN(Number(e.value)) && e.value !== "");
  
  if (secrets.length > 0) {
    hints.push(`# 🔐 Migration hint: ${secrets.length} potential secrets detected.
# Consider using defineSecret() for: ${secrets.map(s => s.newKey).join(", ")}
# Run: firebase functions:secrets:set ${secrets[0].newKey}\n`);
  }
  
  if (booleans.length > 0) {
    hints.push(`# 📊 Migration hint: ${booleans.length} boolean values detected.
# Consider using defineBoolean() for: ${booleans.map(b => b.newKey).join(", ")}\n`);
  }
  
  if (numbers.length > 0) {
    hints.push(`# 🔢 Migration hint: ${numbers.length} numeric values detected.
# Consider using defineInt() for: ${numbers.map(n => n.newKey).join(", ")}\n`);
  }
  
  if (hints.length > 0) {
    hints.push(`# 💡 For AI-assisted migration, run: firebase functions:config:export --prompt\n`);
  }
  
  return hints.join('\n');
}

/**
 * Validate config values and return warnings for edge cases.
 */
export function validateConfigValues(pInfos: ProjectConfigInfo[]): string[] {
  const warnings: string[] = [];
  
  for (const pInfo of pInfos) {
    if (!pInfo.envs) continue;
    
    for (const env of pInfo.envs) {
      // Check for multiline values
      if (env.value.includes('\n')) {
        warnings.push(`${env.origKey}: Contains newlines (will be escaped)`);
      }
      
      // Check for very long values
      if (env.value.length > 1000) {
        warnings.push(`${env.origKey}: Very long value (${env.value.length} chars)`);
      }
      
      // Check for empty values
      if (env.value === '') {
        warnings.push(`${env.origKey}: Empty value`);
      }
    }
  }
  
  return warnings;
}

/**
 * Get value for a specific key path from nested config object.
 */
export function getValueForKey(config: Record<string, unknown>, path: string): unknown {
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

/**
 * Build categorized config objects with their values based on analysis.
 */
export function buildCategorizedConfigs(
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
