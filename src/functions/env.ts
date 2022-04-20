import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import { logBullet } from "../utils";

const FUNCTIONS_EMULATOR_DOTENV = ".env.local";

const RESERVED_PREFIXES = ["X_GOOGLE_", "FIREBASE_", "EXT_"];
const RESERVED_KEYS = [
  // Cloud Functions for Firebase
  "FIREBASE_CONFIG",
  "CLOUD_RUNTIME_CONFIG",
  "EVENTARC_CLOUD_EVENT_SOURCE",
  // Cloud Functions - old runtimes:
  //   https://cloud.google.com/functions/docs/env-var#nodejs_8_python_37_and_go_111
  "ENTRY_POINT",
  "GCP_PROJECT",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "FUNCTION_TRIGGER_TYPE",
  "FUNCTION_NAME",
  "FUNCTION_MEMORY_MB",
  "FUNCTION_TIMEOUT_SEC",
  "FUNCTION_IDENTITY",
  "FUNCTION_REGION",
  // Cloud Functions - new runtimes:
  //   https://cloud.google.com/functions/docs/env-var#newer_runtimes
  "FUNCTION_TARGET",
  "FUNCTION_SIGNATURE_TYPE",
  "K_SERVICE",
  "K_REVISION",
  "PORT",
  // Cloud Run:
  //   https://cloud.google.com/run/docs/reference/container-contract#env-vars
  "K_CONFIGURATION",
];

// Regex to capture key, value pair in a dotenv file.
// Inspired by:
//   https://github.com/bkeepers/dotenv/blob/master/lib/dotenv/parser.rb
// prettier-ignore
const LINE_RE = new RegExp(
  "^" +                      // begin line
  "\\s*" +                   //   leading whitespaces
  "(\\w+)" +                 //   key
  "\\s*=[\\f\\t\\v]*" +              //   separator (=)
  "(" +                      //   begin optional value
  "\\s*'(?:\\\\'|[^'])*'|" + //     single quoted or
  '\\s*"(?:\\\\"|[^"])*"|' + //     double quoted or
  "[^#\\r\\n]*" +           //     unquoted
  ")?" +                     //   end optional value
  "\\s*" +                   //   trailing whitespaces
  "(?:#[^\\n]*)?" +          //   optional comment
  "$",                       // end line
  "gms"                      // flags: global, multiline, dotall
);

const ESCAPE_SEQUENCES_TO_CHARACTERS: Record<string, string> = {
  "\\n": "\n",
  "\\r": "\r",
  "\\t": "\t",
  "\\v": "\v",
  "\\\\": "\\",
  "\\'": "'",
  '\\"': '"',
};

interface ParseResult {
  envs: Record<string, string>;
  errors: string[];
}

/**
 * Parse contents of a dotenv file.
 *
 * Each line should contain key, value pairs, e.g.:
 *
 *   SERVICE_URL=https://example.com
 *
 * Values can be double quoted, e.g.:
 *
 *   SERVICE_URL="https://example.com"
 *
 * Double quoted values can include newlines, e.g.:
 *
 *   PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nABC\nEFG\n-----BEGIN PUBLIC KEY-----""
 *
 * or span multiple lines, e.g.:
 *
 *   PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
 *   ABC
 *   EFG
 *   -----BEGIN PUBLIC KEY-----"
 *
 * See test for more examples.
 *
 * @return {ParseResult} Result containing parsed key, value pairs and errored lines.
 */
export function parse(data: string): ParseResult {
  const envs: Record<string, string> = {};
  const errors: string[] = [];

  data = data.replace(/\r\n?/, "\n"); // For Windows support.
  let match;
  while ((match = LINE_RE.exec(data))) {
    let [, k, v] = match;
    v = (v || "").trim();

    let quotesMatch;
    if ((quotesMatch = /^(["'])(.*)\1$/ms.exec(v)) != null) {
      // Remove surrounding single/double quotes.
      v = quotesMatch[2];
      if (quotesMatch[1] === '"') {
        // Substitute escape sequences. The regex passed to replace() must
        // match every key in ESCAPE_SEQUENCES_TO_CHARACTERS.
        v = v.replace(/\\[nrtv\\'"]/g, (match) => ESCAPE_SEQUENCES_TO_CHARACTERS[match]);
      }
    }

    envs[k] = v;
  }

  const nonmatches = data.replace(LINE_RE, "");
  for (let line of nonmatches.split(/[\r\n]+/)) {
    line = line.trim();
    if (line.startsWith("#")) {
      // Ignore comments
      continue;
    }
    if (line.length) errors.push(line);
  }

  return { envs, errors };
}

export class KeyValidationError extends Error {
  constructor(public key: string, public message: string) {
    super(`Failed to validate key ${key}: ${message}`);
  }
}

/**
 * Validates string for use as an env var key.
 *
 * We restrict key names to ones that conform to POSIX standards.
 * This is more restrictive than what is allowed in Cloud Functions or Cloud Run.
 */
export function validateKey(key: string): void {
  if (RESERVED_KEYS.includes(key)) {
    throw new KeyValidationError(key, `Key ${key} is reserved for internal use.`);
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new KeyValidationError(
      key,
      `Key ${key} must start with an uppercase ASCII letter or underscore` +
        ", and then consist of uppercase ASCII letters, digits, and underscores."
    );
  }
  if (RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new KeyValidationError(
      key,
      `Key ${key} starts with a reserved prefix (${RESERVED_PREFIXES.join(" ")})`
    );
  }
}

// Parse dotenv file, but throw errors if:
//   1. Input has any invalid lines.
//   2. Any env key fails validation.
export function parseStrict(data: string): Record<string, string> {
  const { envs, errors } = parse(data);

  if (errors.length) {
    throw new FirebaseError(`Invalid dotenv file, error on lines: ${errors.join(",")}`);
  }

  const validationErrors: KeyValidationError[] = [];
  for (const key of Object.keys(envs)) {
    try {
      validateKey(key);
    } catch (err: any) {
      logger.debug(`Failed to validate key ${key}: ${err}`);
      if (err instanceof KeyValidationError) {
        validationErrors.push(err);
      } else {
        // Unexpected error. Throw.
        throw err;
      }
    }
  }
  if (validationErrors.length > 0) {
    throw new FirebaseError("Validation failed", { children: validationErrors });
  }

  return envs;
}

function findEnvfiles(
  functionsSource: string,
  projectId: string,
  projectAlias?: string,
  isEmulator?: boolean
): string[] {
  const files: string[] = [".env"];
  files.push(`.env.${projectId}`);
  if (projectAlias) {
    files.push(`.env.${projectAlias}`);
  }
  if (isEmulator) {
    files.push(FUNCTIONS_EMULATOR_DOTENV);
  }

  return files
    .map((f) => path.join(functionsSource, f))
    .filter(fs.existsSync)
    .map((p) => path.basename(p));
}

export interface UserEnvsOpts {
  functionsSource: string;
  projectId: string;
  projectAlias?: string;
  isEmulator?: boolean;
}

/**
 * Checks if user has specified any environment variables for their functions.
 *
 * @return True if there are any user-specified environment variables
 */
export function hasUserEnvs({
  functionsSource,
  projectId,
  projectAlias,
  isEmulator,
}: UserEnvsOpts): boolean {
  return findEnvfiles(functionsSource, projectId, projectAlias, isEmulator).length > 0;
}

/**
 * Load user-specified environment variables.
 *
 * Look for .env files at the root of functions source directory
 * and load the contents of the .env files.
 *
 * .env files are searched and merged in the following order:
 *
 *   1. .env
 *   2. .env.<project or alias>
 *
 * If both .env.<project> and .env.<alias> files are found, an error is thrown.
 *
 * @return {Record<string, string>} Environment variables for the project.
 */
export function loadUserEnvs({
  functionsSource,
  projectId,
  projectAlias,
  isEmulator,
}: UserEnvsOpts): Record<string, string> {
  const envFiles = findEnvfiles(functionsSource, projectId, projectAlias, isEmulator);
  if (envFiles.length === 0) {
    return {};
  }

  // Disallow setting both .env.<projectId> and .env.<projectAlias>
  if (projectAlias) {
    if (envFiles.includes(`.env.${projectId}`) && envFiles.includes(`.env.${projectAlias}`)) {
      throw new FirebaseError(
        `Can't have both dotenv files with projectId (env.${projectId}) ` +
          `and projectAlias (.env.${projectAlias}) as extensions.`
      );
    }
  }

  let envs: Record<string, string> = {};
  for (const f of envFiles) {
    try {
      const data = fs.readFileSync(path.join(functionsSource, f), "utf8");
      envs = { ...envs, ...parseStrict(data) };
    } catch (err: any) {
      throw new FirebaseError(`Failed to load environment variables from ${f}.`, {
        exit: 2,
        children: err.children?.length > 0 ? err.children : [err],
      });
    }
  }
  logBullet(
    clc.cyan.bold("functions: ") + `Loaded environment variables from ${envFiles.join(", ")}.`
  );

  return envs;
}

/**
 * Load Firebase-set environment variables.
 *
 * @return Environment varibles for functions.
 */
export function loadFirebaseEnvs(
  firebaseConfig: Record<string, any>,
  projectId: string
): Record<string, string> {
  return {
    FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
    GCLOUD_PROJECT: projectId,
  };
}
