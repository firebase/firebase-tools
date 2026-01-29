import { FunctionsConfig, FunctionConfig, IsolateConfig } from "../firebaseConfig";
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
  disallowLegacyRuntimeConfig?: boolean;
  isolate?: IsolateConfig;
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
  const { source, remoteSource, runtime, codebase: providedCodebase, ...rest } = config;

  // Exactly one of source or remoteSource must be specified
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

  const codebase = providedCodebase ?? DEFAULT_CODEBASE;
  validateCodebase(codebase);
  if (config.prefix) {
    validatePrefix(config.prefix);
  }
  const commonConfig = { codebase, ...rest };
  if (source) {
    return {
      ...commonConfig,
      source,
      ...(runtime ? { runtime } : {}),
    };
  } else if (remoteSource) {
    if (!remoteSource.repository || !remoteSource.ref) {
      throw new FirebaseError("remoteSource requires 'repository' and 'ref' to be specified.");
    }
    if (!runtime) {
      // TODO: Once functions.yaml can provide a runtime, relax this requirement.
      throw new FirebaseError(
        "functions.runtime is required when using remoteSource in firebase.json.",
      );
    }
    return {
      ...commonConfig,
      remoteSource,
      runtime,
    };
  }

  // Unreachable due to XOR guard
  throw new FirebaseError("Invalid functions config.");
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
      sourceIdentifier = `remote:${c.remoteSource.repository}#${c.remoteSource.ref}@dir:${
        c.remoteSource.dir || "."
      }`;
      sourceDescription = `remote source ('${c.remoteSource.repository}')`;
    } else {
      // This case should be prevented by `validateSingle`.
      continue;
    }

    const key = JSON.stringify({ source: sourceIdentifier, prefix: c.prefix || "" });
    if (sourcePrefixPairs.has(key)) {
      throw new FirebaseError(
        `More than one functions config specifies the same ${sourceDescription} and prefix ('${
          c.prefix ?? ""
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

/** Returns true if the codebase uses a local source. */
export function isLocalConfig(c: ValidatedSingle): c is ValidatedLocalSingle {
  return (c as ValidatedLocalSingle).source !== undefined;
}

/** Returns true if the codebase uses a remote source. */
export function isRemoteConfig(c: ValidatedSingle): c is ValidatedRemoteSingle {
  return (c as ValidatedRemoteSingle).remoteSource !== undefined;
}

/**
 * Require a local functions config. Throws a FirebaseError if the config is remote.
 * @param c The validated functions config entry.
 * @param purpose Optional message to use in the error.
 */
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
 * Resolve the directory used for .env files.
 * - Local: returns `configDir` if set, otherwise `source`.
 * - Remote: returns `configDir` if set, otherwise `undefined`.
 */
export function resolveConfigDir(c: ValidatedSingle): string | undefined {
  return c.configDir || c.source;
}

/**
 * Determines if a codebase should use runtime config.
 *
 * Only local sources that haven't opted out via disallowLegacyRuntimeConfig use runtime config.
 * Remote sources never use runtime config.
 *
 * @param cfg The codebase configuration to check
 * @returns true if this codebase should use runtime config, false otherwise
 */
export function shouldUseRuntimeConfig(cfg: ValidatedSingle): boolean {
  return isLocalConfig(cfg) && cfg.disallowLegacyRuntimeConfig !== true;
}
