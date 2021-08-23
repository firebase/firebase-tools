import * as env from "./env";
import { FirebaseError } from "../error";

export interface EnvMap {
  origKey: string;
  newKey: string;
  value: string;
  err?: string;
}

interface ConfigToEnvResult {
  success: EnvMap[];
  errors: Required<EnvMap>[];
}

/**
 * Flatten object with '.' as delimited key.
 */
export function flatten(obj: Record<string, unknown>): Record<string, unknown> {
  /**
   *
   */
  function* helper(path: string[], obj: Record<string, unknown>): Generator<[string, unknown]> {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "object" || v === null) {
        yield [[...path, k].join("."), v];
      } else {
        // Object.entries loses type info, so we must cast
        yield* helper([...path, k], v as Record<string, unknown>);
      }
    }
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of helper([], obj)) {
    result[k] = v;
  }
  return result;
}
/**
 * Converts functions config key from runtimeconfig to env var key.
 * If the original config key fails to convert, try again with provided prefix.
 *
 * Throws KeyValidationErrorr if the converted key is invalid.
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
  } catch (err) {
    if (err instanceof env.KeyValidationError) {
      envKey = prefix + envKey;
      env.validateKey(envKey);
    }
  }
  return envKey;
}

/**
 * Convert functions config to environment variables.
 *   e.g. someservice.key => SOMESERVICE_KEY
 *
 * @return {ConfigToEnvResult} Collection of successful and errored conversion.
 */
export function configToEnv(configs: Record<string, any>, prefix: string): ConfigToEnvResult {
  const success = [];
  const errors = [];

  for (const [configKey, value] of Object.entries(flatten(configs))) {
    try {
      const envKey = convertKey(configKey, prefix);
      success.push({ origKey: configKey, newKey: envKey, value: value as string });
    } catch (err) {
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

function escape(s: string): string {
  // Escape newlines and tabs
  let result = s
    .replace("\n", "\\n")
    .replace("\r", "\\r")
    .replace("\t", "\\t")
    .replace("\v", "\\v");
  // Escape other escape characters like ' and ".
  result = result.replace(/(['"])/g, "\\$1");
  return result;
}

/**
 * Convert env var mappings to string in dotenv format.
 */
export function toDotenvFormat(envs: EnvMap[], header = ""): string {
  const lines = envs.map(({ newKey, value }) => `${newKey}="${escape(value)}"`);
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  return (
    `${header}\n` +
    lines.map((line, idx) => `${line.padEnd(maxLineLen)} # from ${envs[idx].origKey}`).join("\n")
  );
}
