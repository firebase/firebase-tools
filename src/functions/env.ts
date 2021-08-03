import * as fs from "fs";
import * as path from "path";

import { FirebaseError } from "../error";
import { logger } from "../logger";

const RESERVED_KEYS = [
  // Cloud Functions for Firebase
  "FIREBASE_CONFIG",
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
  "^" +                    // begin line
  "\\s*" +                 //   leading whitespaces
  "(\\w+)" +               //   key
  "\\s*=\\s*" +            //   separator (=)
  "(" +                    //   begin optional value
  `\\s*'(?:\\'|[^'])*'|` + //     single quoted or
  `\\s*"(?:\\"|[^"])*"|` + //     double quoted or
  "[^\\#\\r\\n]+" +        //     unquoted
  ")?" +                   //   end optional value
  "\\s*" +                 //   trailing whitespaces
  "(?:\\#[^\\n]*)?" +      //   optional comment
  "$",                     // end line
  "gms"                    // flags: global, multiline, dotall
);

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
        // Unescape newlines and tabs.
        v = v.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t").replace("\\v", "\v");
        // Unescape other escapable characters.
        v = v.replace(/\\([\\'"])/g, "$1");
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

/**
 * Validates string for use as an env var key.
 *
 * We restrict key names to ones that conform to POSIX standards.
 * This is more restrictive than what is allowed in Cloud Functions or Cloud Run.
 */
export function validateKey(key: string): void {
  if (RESERVED_KEYS.includes(key)) {
    throw new Error("Key reserved for internal use.");
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(
      "Key must start with an uppercase ASCII letter or underscore" +
        ", and then consist of uppercase ASCII letters, digits, and underscores."
    );
  }
  if (key.startsWith("X_GOOGLE_") || key.startsWith("FIREBASE_")) {
    throw new Error("Key starts with a reserved prefix (X_GOOGLE_ or FIREBASE_)");
  }
}

// Parse dotenv file, but throw errors if:
//   1. Input has any invalid lines.
//   2. Any env key is reserved.
function parseStrict(data: string): Record<string, string> {
  const { envs, errors } = parse(data);

  if (errors.length) {
    logger.debug(`Invalid dotenv file, error on lines:\n${errors.join("\n")}`);
    throw new Error(`Invalid dotenv file, error on lines: ${errors.join(",")}`);
  }

  const invalidKeys: Record<string, string> = {};
  for (const key of Object.keys(envs)) {
    try {
      validateKey(key);
    } catch (err) {
      invalidKeys[key] = err.message || "unknown error";
    }
  }
  if (Object.keys(invalidKeys).length > 0) {
    logger.debug(
      `Found invalid keys: ${Object.entries(invalidKeys)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}`
    );
    throw new Error(`Found invalid keys: ${Object.keys(invalidKeys).join(",")}`);
  }

  return envs;
}

/**
 * Loads environment variables for a project.
 *
 * Load looks for .env files at the root of functions source directory
 * and loads the contents of the .env files.
 *
 * .env files are searched and merged in the following order:
 *
 *   1. .env
 *   2. .env.<project or alias> (or .env.local if isEmulator is true).
 *
 * If both .env.<project> and .env.<alias> files are found, an error is thrown.
 *
 * @return {Record<string, string>} Environment variables for the project.
 */
export function load(options: {
  functionsSource: string;
  projectId: string;
  projectAlias?: string;
  isEmulator?: boolean;
}): Record<string, string> {
  const targetFiles = [".env"];
  if (options.isEmulator) {
    targetFiles.push(".env.local");
  } else {
    targetFiles.push(`.env.${options.projectId}`);
    if (options.projectAlias && options.projectAlias.length) {
      targetFiles.push(`.env.${options.projectAlias}`);
    }
  }

  const targetPaths = targetFiles
    .map((f) => path.join(options.functionsSource, f))
    .filter(fs.existsSync);

  // Check if both .env.<project> and .env.<alias> exists.
  if (targetPaths.some((p) => path.basename(p) === `.env.${options.projectId}`)) {
    if (options.projectAlias && options.projectAlias.length) {
      for (const p of targetPaths) {
        if (path.basename(p) === `.env.${options.projectAlias}`) {
          throw new FirebaseError("Can't have both .env.<project> and .env.<alias> files.");
        }
      }
    }
  }

  let envs: Record<string, string> = {};
  for (const targetPath of targetPaths) {
    try {
      const data = fs.readFileSync(targetPath, "utf8");
      envs = { ...envs, ...parseStrict(data) };
    } catch (err) {
      logger.debug(`Failed to load environment variables from ${targetPath}`, err);
      throw new FirebaseError(`Failed to load environment variables from ${targetPath}: ${err}`, {
        exit: 2,
        original: err,
      });
    }
  }
  logger.debug(
    `Loaded environment variables ${JSON.stringify(envs)} from ${targetPaths.join(",")}.`
  );

  return envs;
}
