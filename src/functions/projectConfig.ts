import { FunctionsConfig, FunctionConfig } from "../firebaseConfig";
import { FirebaseError } from "../error";

export type NormalizedConfig = [FunctionConfig, ...FunctionConfig[]];
export type ValidatedSingle = FunctionConfig & { source: string; codebase: string };
export type ValidatedConfig = [ValidatedSingle, ...ValidatedSingle[]];

export const DEFAULT_CODEBASE = "default";

/**
 * Normalize functions config to return functions config in an array form.
 */
export function normalize(config?: FunctionsConfig): NormalizedConfig {
  if (!config) {
    throw new FirebaseError("No valid functions configuration detected in firebase.json");
  }

  if (Array.isArray(config)) {
    if (config.length < 1) {
      throw new FirebaseError("Requires at least one functions.source in firebase.json.");
    }
    // Unfortunately, Typescript can't figure out that config has at least one element. We assert the type manually.
    return config as NormalizedConfig;
  }
  return [config];
}

/**
 * Check that the codebase name is less than 64 characters and only contains allowed characters.
 */
export function validateCodebase(codebase: string): void {
  if (codebase.length === 0 || codebase.length > 63 || !/^[a-z0-9_-]+$/.test(codebase)) {
    throw new FirebaseError(
      "Invalid codebase name. Codebase must be less than 64 characters and " +
        "can contain only lowercase letters, numeric characters, underscores, and dashes.",
    );
  }
}

function validateSingle(config: FunctionConfig): ValidatedSingle {
  if (!config.source) {
    throw new FirebaseError("codebase source must be specified");
  }
  if (!config.codebase) {
    config.codebase = DEFAULT_CODEBASE;
  }
  validateCodebase(config.codebase);

  return { ...config, source: config.source, codebase: config.codebase };
}

/**
 * Check that the property is unique in the given config.
 */
export function assertUnique(
  config: ValidatedConfig,
  property: keyof ValidatedSingle,
  propval?: string,
): void {
  const values = new Set();
  if (propval) {
    values.add(propval);
  }
  for (const single of config) {
    const value = single[property];
    if (values.has(value)) {
      throw new FirebaseError(
        `functions.${property} must be unique but '${value}' was used more than once.`,
      );
    }
    values.add(value);
  }
}

/**
 * Validate functions config.
 */
export function validate(config: NormalizedConfig): ValidatedConfig {
  const validated = config.map((cfg) => validateSingle(cfg)) as ValidatedConfig;
  assertUnique(validated, "source");
  assertUnique(validated, "codebase");
  return validated;
}

/**
 * Normalize and validate functions config.
 *
 * Valid functions config has exactly one config and has all required fields set.
 */
export function normalizeAndValidate(config?: FunctionsConfig): ValidatedConfig {
  return validate(normalize(config));
}

/**
 * Return functions config for given codebase.
 */
export function configForCodebase(config: ValidatedConfig, codebase: string): ValidatedSingle {
  const codebaseCfg = config.find((c) => c.codebase === codebase);
  if (!codebaseCfg) {
    throw new FirebaseError(`No functions config found for codebase ${codebase}`);
  }
  return codebaseCfg;
}
