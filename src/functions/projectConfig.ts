/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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

function validateSingle(config: FunctionConfig): ValidatedSingle {
  if (!config.source) {
    throw new FirebaseError("functions.source must be specified");
  }
  if (!config.codebase) {
    config.codebase = DEFAULT_CODEBASE;
  }
  if (config.codebase.length > 63 || !/^[a-z0-9_-]+$/.test(config.codebase)) {
    throw new FirebaseError(
      "Invalid codebase name. Codebase must be less than 63 characters and " +
        "can contain only lowercase letters, numeric characters, underscores, and dashes."
    );
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
