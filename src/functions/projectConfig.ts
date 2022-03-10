import { FunctionsConfig, FunctionsSingle } from "../firebaseConfig";
import { FirebaseError } from "../error";

export type NormalizedConfig = [FunctionsSingle, ...FunctionsSingle[]];
export type ValidatedSingle = FunctionsSingle & { source: string };
export type ValidatedConfig = [ValidatedSingle];

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
    // Unfortunately, Typescript can't figure out that config has at least one element. We assert the type manually.
    return config as NormalizedConfig;
  }
  return [config];
}

function validateSingle(config: FunctionsSingle): ValidatedSingle {
  if (!config.source) {
    throw new FirebaseError("functions.source must be specified");
  }
  return { ...config, source: config.source };
}

/**
 * Validate functions config.
 */
export function validate(config: NormalizedConfig): ValidatedConfig {
  if (config.length > 1) {
    throw new FirebaseError("More than one functions.source detected in firebase.json.");
  }
  return [validateSingle(config[0])];
}

/**
 * Normalize and validate functions config.
 *
 * Valid functions config has exactly one config and has all required fields set.
 */
export function normalizeAndValidate(config: FunctionsConfig | undefined): ValidatedConfig {
  return validate(normalize(config));
}
