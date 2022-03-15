import { FunctionsConfig, FunctionsSingle } from "../firebaseConfig";
import { FirebaseError } from "../error";

export type NormalizedConfig = [FunctionsSingle, ...FunctionsSingle[]];
export type ValidatedSingle = FunctionsSingle & { source: string; codebase: string };
export type ValidatedConfig = [ValidatedSingle, ...ValidatedSingle[]];

export const DEFAULT_CODEBASE = "default";

/**
 * Normalize functions config to return functions config in an array form.
 */
export function normalize(config: FunctionsConfig | undefined): NormalizedConfig {
  if (config === undefined) {
    throw new FirebaseError("No valid functions configuration detected in firebase.json");
  }

  if (Array.isArray(config)) {
    if (config.length < 1) {
      throw new FirebaseError("Requires at least one functions.source in firebase.json.");
    }
    // Unfortunately, Typescript can't figure out that config has at least one element. Assert type instead.
    return config as NormalizedConfig;
  }
  return [config];
}

function validateSingle(config: FunctionsSingle): ValidatedSingle {
  if (!config.source) {
    throw new FirebaseError("functions.source must be specified");
  }
  if (!config.codebase) {
    config.codebase = DEFAULT_CODEBASE;
  }
  return { ...config, source: config.source, codebase: config.codebase };
}

function assertUnique(config: ValidatedConfig, property: keyof ValidatedSingle) {
  const values = new Set();
  for (const single of config) {
    const value = single[property];
    if (values.has(value)) {
      throw new FirebaseError(
        `functions.${property} must be unique but '${value}' was used more than once.`
      );
    }
    values.add(value);
  }
}

/**
 * Validate functions config.
 */
export function validate(config: NormalizedConfig): ValidatedConfig {
  // Unfortunately, Typescript can't figure out that config has at least one element. Assert type instead.
  const validated = config.map((c) => validateSingle(c)) as ValidatedConfig;

  assertUnique(validated, "source");
  assertUnique(validated, "codebase");

  return validated;
}

/**
 * Normalize and validate functions config.
 *
 * Valid functions config has exactly one config and has all required fields set.
 */
export function normalizeAndValidate(config: FunctionsConfig | undefined): ValidatedConfig {
  return validate(normalize(config));
}
