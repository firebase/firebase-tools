import { FunctionsConfig, FunctionsSingle } from "../firebaseConfig";
import { FirebaseError } from "../error";

export type ValidatedFunctionsSingle = FunctionsSingle & { source: string; codebase: string };
export type ValidatedFunctionsConfig = [ValidatedFunctionsSingle, ...ValidatedFunctionsSingle[]];

/**
 * Normalize (and validate) functions config to return functions config in an array form.
 */
export function normalizeConfig(config: FunctionsConfig | undefined): ValidatedFunctionsConfig {
  let normalized: FunctionsConfig;

  if (config === undefined) {
    throw new FirebaseError("No valid functions configuration detected in firebase.json");
  }

  if (Array.isArray(config)) {
    normalized = config;
  } else {
    normalized = [config];
  }

  if (normalized.length < 1) {
    throw new FirebaseError("No valid functions configuration detected in firebase.json");
  }

  const validated: ValidatedFunctionsSingle[] = [];
  const errs: FirebaseError[] = [];
  for (const [idx, cfg] of normalized.entries()) {
    try {
      validated.push(validateConfig(idx, cfg));
    } catch(err: unknown) {
      errs.push(err as FirebaseError);
    }
  }
  if (errs.length > 0) {
    throw new FirebaseError("Failed to validate functions config in firebase.json", { children: errs })
  }

  return validateConfigs(validated);
}

/**
 * Validates a single functions config. A valid functions config must have source.
 * @param config
 */
export function validateConfig(idx: number, config: FunctionsSingle): ValidatedFunctionsSingle {
  if (!config.source) {
    throw new FirebaseError(`Missing functions.[${idx}].source in firebase.json`);
  }
  if (!config.codebase) {
    config.codebase = "default";
  }
  return config as ValidatedFunctionsSingle;
}


export function validateConfigs(configs: ValidatedFunctionsSingle[]): ValidatedFunctionsConfig {
  if (configs.length < 1) {
    throw new FirebaseError("No valid functions configuration detected in firebase.json");
  }
  return configs;
}
