import { FunctionsConfig, FunctionConfig } from "../firebaseConfig";
import { FirebaseError } from "../error";
import type { ActiveRuntime } from "../deploy/functions/runtimes/supported/types";

export type NormalizedConfig = [FunctionConfig, ...FunctionConfig[]];
// Stronger validated variants: local vs remote.
type FunctionConfigCommon = Omit<
  FunctionConfig,
  "source" | "remoteSource" | "codebase" | "runtime"
>;

export type ValidatedLocalSingle = FunctionConfigCommon & {
  source: string;
  codebase: string;
  // runtime optional for local (auto-detected if not provided)
  runtime?: ActiveRuntime;
  remoteSource?: never;
};

export type ValidatedRemoteSingle = FunctionConfigCommon & {
  remoteSource: { repository: string; ref: string; dir?: string };
  // runtime required for remote
  runtime: ActiveRuntime;
  codebase: string;
  source?: never;
};

export type ValidatedSingle = ValidatedLocalSingle | ValidatedRemoteSingle;
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

/**
 * Check that the prefix contains only allowed characters.
 */
export function validatePrefix(prefix: string): void {
  if (prefix.length > 30) {
    throw new FirebaseError("Invalid prefix. Prefix must be 30 characters or less.");
  }
  // Must start with a letter so that the resulting function id also starts with a letter.
  if (!/^[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(prefix)) {
    throw new FirebaseError(
      "Invalid prefix. Prefix must start with a lowercase letter, can contain only lowercase letters, numeric characters, and dashes, and cannot start or end with a dash.",
    );
  }
}

function validateSingle(config: FunctionConfig): ValidatedSingle {
  const { source, remoteSource, runtime } = config;

  if (source && remoteSource) {
    throw new FirebaseError(
      "Cannot specify both 'source' and 'remoteSource' in a single functions config. Please choose one.",
    );
  }
  if (!source && !remoteSource) {
    throw new FirebaseError(
      "codebase source must be specified. Must specify either 'source' or 'remoteSource' in a functions config.",
    );
  }

  if (remoteSource) {
    if (!remoteSource.repository || !remoteSource.ref) {
      throw new FirebaseError("remoteSource requires 'repository' and 'ref' to be specified.");
    }
    if (!runtime) {
      // TODO: Once functions.yaml can provide a runtime, relax this requirement.
      throw new FirebaseError(
        "functions.runtime is required when using remoteSource in firebase.json.",
      );
    }
  }

  if (!config.codebase) {
    config.codebase = DEFAULT_CODEBASE;
  }
  validateCodebase(config.codebase);
  if (config.prefix) {
    validatePrefix(config.prefix);
  }

  // Narrow to validated shapes
  const { codebase, prefix, ignore, configDir, predeploy, postdeploy } = config;
  if (source) {
    const validated: ValidatedLocalSingle = {
      source,
      codebase,
      ...(runtime ? { runtime } : {}),
      ...(prefix ? { prefix } : {}),
      ...(ignore ? { ignore } : {}),
      ...(configDir ? { configDir } : {}),
      ...(predeploy ? { predeploy } : {}),
      ...(postdeploy ? { postdeploy } : {}),
    } as ValidatedLocalSingle;
    return validated;
  }

  // remoteSource case already validated above; runtime is required there
  const validated: ValidatedRemoteSingle = {
    remoteSource: remoteSource!,
    runtime: runtime!,
    codebase,
    ...(prefix ? { prefix } : {}),
    ...(ignore ? { ignore } : {}),
    ...(configDir ? { configDir } : {}),
    ...(predeploy ? { predeploy } : {}),
    ...(postdeploy ? { postdeploy } : {}),
  } as ValidatedRemoteSingle;
  return validated;
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

function assertUniqueSourcePrefixPair(config: ValidatedConfig): void {
  const sourcePrefixPairs = new Set<string>();
  for (const c of config) {
    let sourceIdentifier: string;
    let sourceDescription: string;
    if (c.source) {
      sourceIdentifier = c.source;
      sourceDescription = `source directory ('${c.source}')`;
    } else if (c.remoteSource) {
      sourceIdentifier = `remote:${c.remoteSource.repository}#${c.remoteSource.ref}@dir:${c.remoteSource.dir || "."
        }`;
      sourceDescription = `remote source ('${c.remoteSource.repository}')`;
    } else {
      // This case should be prevented by `validateSingle`.
      continue;
    }

    const key = JSON.stringify({ source: sourceIdentifier, prefix: c.prefix || "" });
    if (sourcePrefixPairs.has(key)) {
      throw new FirebaseError(
        `More than one functions config specifies the same ${sourceDescription} and prefix ('${c.prefix ?? ""
        }'). Please add a unique 'prefix' to each function configuration that shares this source to resolve the conflict.`,
      );
    }
    sourcePrefixPairs.add(key);
  }
}

/**
 * Validate functions config.
 */
export function validate(config: NormalizedConfig): ValidatedConfig {
  const validated = config.map((cfg) => validateSingle(cfg)) as ValidatedConfig;
  assertUnique(validated, "codebase");
  assertUniqueSourcePrefixPair(validated);
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

// Type guards and helpers to make call sites safer
export function isLocalConfig(c: ValidatedSingle): c is ValidatedLocalSingle {
  return (c as ValidatedLocalSingle).source !== undefined;
}

export function isRemoteConfig(c: ValidatedSingle): c is ValidatedRemoteSingle {
  return (c as ValidatedRemoteSingle).remoteSource !== undefined;
}

export function requireLocal(c: ValidatedSingle, purpose?: string): ValidatedLocalSingle {
  if (!isLocalConfig(c)) {
    const msg =
      purpose ??
      "This operation requires a local functions source directory, but the codebase is configured with a remote source.";
    throw new FirebaseError(msg);
  }
  return c;
}

/**
 * Returns the local directory to read/write env files if available.
 * - Local: returns configDir or source
 * - Remote: returns configDir if present; otherwise undefined (skip dotenv)
 */
export function resolveConfigDir(c: ValidatedSingle): string | undefined {
  if (c.configDir) return c.configDir;
  if (isLocalConfig(c)) return c.source;
  return undefined;
}
