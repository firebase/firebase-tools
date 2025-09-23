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
