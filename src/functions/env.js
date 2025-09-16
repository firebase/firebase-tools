"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeResolvedParams = exports.loadFirebaseEnvs = exports.loadUserEnvs = exports.checkForDuplicateKeys = exports.writeUserEnvs = exports.hasUserEnvs = exports.parseStrict = exports.validateKey = exports.KeyValidationError = exports.parse = void 0;
const clc = __importStar(require("colorette"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const error_1 = require("../error");
const logger_1 = require("../logger");
const utils_1 = require("../utils");
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
const LINE_RE = new RegExp("^" + // begin line
    "\\s*" + //   leading whitespaces
    "(?:export)?" + // Optional 'export' in a non-capture group
    "\\s*" + //   more whitespaces
    "([\\w./]+)" + //   key
    "\\s*=[\\f\\t\\v]*" + //   separator (=)
    "(" + //   begin optional value
    "\\s*'(?:\\\\'|[^'])*'|" + //     single quoted or
    '\\s*"(?:\\\\"|[^"])*"|' + //     double quoted or
    "[^#\\r\\n]*" + //     unquoted
    ")?" + //   end optional value
    "\\s*" + //   trailing whitespaces
    "(?:#[^\\n]*)?" + //   optional comment
    "$", // end line
"gms" // flags: global, multiline, dotall
);
const ESCAPE_SEQUENCES_TO_CHARACTERS = {
    "\\n": "\n",
    "\\r": "\r",
    "\\t": "\t",
    "\\v": "\v",
    "\\\\": "\\",
    "\\'": "'",
    '\\"': '"',
};
const ALL_ESCAPE_SEQUENCES_RE = /\\[nrtv\\'"]/g;
const CHARACTERS_TO_ESCAPE_SEQUENCES = {
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\v": "\\v",
    "\\": "\\\\",
    "'": "\\'",
    '"': '\\"',
};
const ALL_ESCAPABLE_CHARACTERS_RE = /[\n\r\t\v\\'"]/g;
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
function parse(data) {
    const envs = {};
    const errors = [];
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
                v = v.replace(ALL_ESCAPE_SEQUENCES_RE, (match) => ESCAPE_SEQUENCES_TO_CHARACTERS[match]);
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
        if (line.length)
            errors.push(line);
    }
    return { envs, errors };
}
exports.parse = parse;
class KeyValidationError extends Error {
    constructor(key, message) {
        super(`Failed to validate key ${key}: ${message}`);
        this.key = key;
        this.message = message;
    }
}
exports.KeyValidationError = KeyValidationError;
/**
 * Validates string for use as an env var key.
 *
 * We restrict key names to ones that conform to POSIX standards.
 * This is more restrictive than what is allowed in Cloud Functions or Cloud Run.
 */
function validateKey(key) {
    if (RESERVED_KEYS.includes(key)) {
        throw new KeyValidationError(key, `Key ${key} is reserved for internal use.`);
    }
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        throw new KeyValidationError(key, `Key ${key} must start with an uppercase ASCII letter or underscore` +
            ", and then consist of uppercase ASCII letters, digits, and underscores.");
    }
    if (RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        throw new KeyValidationError(key, `Key ${key} starts with a reserved prefix (${RESERVED_PREFIXES.join(" ")})`);
    }
}
exports.validateKey = validateKey;
/**
 * Parse dotenv file, but throw errors if:
 * 1. Input has any invalid lines.
 * 2. Any env key fails validation.
 */
function parseStrict(data) {
    const { envs, errors } = parse(data);
    if (errors.length) {
        throw new error_1.FirebaseError(`Invalid dotenv file, error on lines: ${errors.join(",")}`);
    }
    const validationErrors = [];
    for (const key of Object.keys(envs)) {
        try {
            validateKey(key);
        }
        catch (err) {
            logger_1.logger.debug(`Failed to validate key ${key}: ${err}`);
            if (err instanceof KeyValidationError) {
                validationErrors.push(err);
            }
            else {
                // Unexpected error. Throw.
                throw err;
            }
        }
    }
    if (validationErrors.length > 0) {
        throw new error_1.FirebaseError("Validation failed", { children: validationErrors });
    }
    return envs;
}
exports.parseStrict = parseStrict;
function findEnvfiles(configDir, projectId, projectAlias, isEmulator) {
    const files = [".env"];
    files.push(`.env.${projectId}`);
    if (projectAlias) {
        files.push(`.env.${projectAlias}`);
    }
    if (isEmulator) {
        files.push(FUNCTIONS_EMULATOR_DOTENV);
    }
    return files
        .map((f) => path.join(configDir, f))
        .filter(fs.existsSync)
        .map((p) => path.basename(p));
}
/**
 * Checks if user has specified any environment variables for their functions.
 *
 * @return True if there are any user-specified environment variables
 */
function hasUserEnvs(opts) {
    const configDir = opts.configDir || opts.functionsSource;
    return findEnvfiles(configDir, opts.projectId, opts.projectAlias, opts.isEmulator).length > 0;
}
exports.hasUserEnvs = hasUserEnvs;
/**
 * Write new environment variables into a dotenv file.
 *
 * Identifies one and only one dotenv file to touch using the same rules as loadUserEnvs().
 * It is an error to provide a key-value pair which is already in the file.
 */
function writeUserEnvs(toWrite, envOpts) {
    if (Object.keys(toWrite).length === 0) {
        return;
    }
    const { projectId, projectAlias, isEmulator } = envOpts;
    const configDir = envOpts.configDir || envOpts.functionsSource;
    // Determine which .env file to write to, and create it if it doesn't exist
    const allEnvFiles = findEnvfiles(configDir, projectId, projectAlias, isEmulator);
    const targetEnvFile = envOpts.isEmulator
        ? FUNCTIONS_EMULATOR_DOTENV
        : `.env.${envOpts.projectId}`;
    const targetEnvFileExists = allEnvFiles.includes(targetEnvFile);
    if (!targetEnvFileExists) {
        fs.writeFileSync(path.join(configDir, targetEnvFile), "", { flag: "wx" });
        (0, utils_1.logBullet)(clc.yellow(clc.bold("functions: ")) +
            `Created new local file ${targetEnvFile} to store param values. We suggest explicitly adding or excluding this file from version control.`);
    }
    // Throw if any of the keys are duplicate (note special case if emulator) or malformed
    const fullEnvs = loadUserEnvs(envOpts);
    const prodEnvs = isEmulator
        ? loadUserEnvs({ ...envOpts, isEmulator: false })
        : loadUserEnvs(envOpts);
    checkForDuplicateKeys(isEmulator || false, Object.keys(toWrite), fullEnvs, prodEnvs);
    for (const k of Object.keys(toWrite)) {
        validateKey(k);
    }
    // Write all the keys in a single filesystem access
    (0, utils_1.logBullet)(clc.cyan(clc.bold("functions: ")) + `Writing new parameter values to disk: ${targetEnvFile}`);
    let lines = "";
    for (const k of Object.keys(toWrite)) {
        lines += formatUserEnvForWrite(k, toWrite[k]);
    }
    fs.appendFileSync(path.join(configDir, targetEnvFile), lines);
}
exports.writeUserEnvs = writeUserEnvs;
/**
 * Errors if any of the provided keys are aleady defined in the .env fields.
 * This seems like a simple presence check, but...
 *
 * For emulator deploys, it's legal to write a key to .env.local even if it's
 * already defined in .env.projectId. This is a special case designed to follow
 * the principle of least surprise for emulator users.
 */
function checkForDuplicateKeys(isEmulator, keys, fullEnv, envsWithoutLocal) {
    for (const key of keys) {
        const definedInEnv = fullEnv.hasOwnProperty(key);
        if (definedInEnv) {
            if (envsWithoutLocal && isEmulator && envsWithoutLocal.hasOwnProperty(key)) {
                (0, utils_1.logWarning)(clc.cyan(clc.yellow("functions: ")) +
                    `Writing parameter ${key} to emulator-specific config .env.local. This will overwrite your existing definition only when emulating.`);
                continue;
            }
            throw new error_1.FirebaseError(`Attempted to write param-defined key ${key} to .env files, but it was already defined.`);
        }
    }
}
exports.checkForDuplicateKeys = checkForDuplicateKeys;
function formatUserEnvForWrite(key, value) {
    const escapedValue = value.replace(ALL_ESCAPABLE_CHARACTERS_RE, (match) => CHARACTERS_TO_ESCAPE_SEQUENCES[match]);
    if (escapedValue !== value) {
        return `${key}="${escapedValue}"\n`;
    }
    return `${key}=${escapedValue}\n`;
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
function loadUserEnvs(opts) {
    const configDir = opts.configDir || opts.functionsSource;
    const envFiles = findEnvfiles(configDir, opts.projectId, opts.projectAlias, opts.isEmulator);
    if (envFiles.length === 0) {
        return {};
    }
    // Disallow setting both .env.<projectId> and .env.<projectAlias>
    if (opts.projectAlias) {
        if (envFiles.includes(`.env.${opts.projectId}`) &&
            envFiles.includes(`.env.${opts.projectAlias}`)) {
            throw new error_1.FirebaseError(`Can't have both dotenv files with projectId (env.${opts.projectId}) ` +
                `and projectAlias (.env.${opts.projectAlias}) as extensions.`);
        }
    }
    let envs = {};
    for (const f of envFiles) {
        try {
            const data = fs.readFileSync(path.join(configDir, f), "utf8");
            envs = { ...envs, ...parseStrict(data) };
        }
        catch (err) {
            throw new error_1.FirebaseError(`Failed to load environment variables from ${f}.`, {
                exit: 2,
                children: err.children?.length > 0 ? err.children : [err],
            });
        }
    }
    (0, utils_1.logBullet)(clc.cyan(clc.bold("functions: ")) + `Loaded environment variables from ${envFiles.join(", ")}.`);
    return envs;
}
exports.loadUserEnvs = loadUserEnvs;
/**
 * Load Firebase-set environment variables.
 *
 * @return Environment varibles for functions.
 */
function loadFirebaseEnvs(firebaseConfig, projectId) {
    return {
        FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
        GCLOUD_PROJECT: projectId,
    };
}
exports.loadFirebaseEnvs = loadFirebaseEnvs;
/**
 * Writes newly resolved params to the appropriate .env file.
 * Skips internal params and params that already exist in userEnvs.
 */
function writeResolvedParams(resolvedEnvs, userEnvs, userEnvOpt) {
    const toWrite = {};
    for (const paramName of Object.keys(resolvedEnvs)) {
        const paramValue = resolvedEnvs[paramName];
        if (!paramValue.internal && !Object.prototype.hasOwnProperty.call(userEnvs, paramName)) {
            toWrite[paramName] = paramValue.toString();
        }
    }
    writeUserEnvs(toWrite, userEnvOpt);
}
exports.writeResolvedParams = writeResolvedParams;
//# sourceMappingURL=env.js.map