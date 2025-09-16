"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConfigDir = exports.requireLocal = exports.isRemoteConfig = exports.isLocalConfig = exports.configForCodebase = exports.normalizeAndValidate = exports.validate = exports.assertUnique = exports.validatePrefix = exports.validateCodebase = exports.normalize = exports.DEFAULT_CODEBASE = void 0;
const error_1 = require("../error");
exports.DEFAULT_CODEBASE = "default";
/**
 * Normalize functions config to return functions config in an array form.
 */
function normalize(config) {
    if (!config) {
        throw new error_1.FirebaseError("No valid functions configuration detected in firebase.json");
    }
    if (Array.isArray(config)) {
        if (config.length < 1) {
            throw new error_1.FirebaseError("Requires at least one functions.source in firebase.json.");
        }
        // Unfortunately, Typescript can't figure out that config has at least one element. We assert the type manually.
        return config;
    }
    return [config];
}
exports.normalize = normalize;
/**
 * Check that the codebase name is less than 64 characters and only contains allowed characters.
 */
function validateCodebase(codebase) {
    if (codebase.length === 0 || codebase.length > 63 || !/^[a-z0-9_-]+$/.test(codebase)) {
        throw new error_1.FirebaseError("Invalid codebase name. Codebase must be less than 64 characters and " +
            "can contain only lowercase letters, numeric characters, underscores, and dashes.");
    }
}
exports.validateCodebase = validateCodebase;
/**
 * Check that the prefix contains only allowed characters.
 */
function validatePrefix(prefix) {
    if (prefix.length > 30) {
        throw new error_1.FirebaseError("Invalid prefix. Prefix must be 30 characters or less.");
    }
    // Must start with a letter so that the resulting function id also starts with a letter.
    if (!/^[a-z](?:[a-z0-9-]*[a-z0-9])?$/.test(prefix)) {
        throw new error_1.FirebaseError("Invalid prefix. Prefix must start with a lowercase letter, can contain only lowercase letters, numeric characters, and dashes, and cannot start or end with a dash.");
    }
}
exports.validatePrefix = validatePrefix;
function validateSingle(config) {
    const { source, remoteSource, runtime, codebase: providedCodebase } = config, rest = __rest(config, ["source", "remoteSource", "runtime", "codebase"]);
    // Exactly one of source or remoteSource must be specified
    if (source && remoteSource) {
        throw new error_1.FirebaseError("Cannot specify both 'source' and 'remoteSource' in a single functions config. Please choose one.");
    }
    if (!source && !remoteSource) {
        throw new error_1.FirebaseError("codebase source must be specified. Must specify either 'source' or 'remoteSource' in a functions config.");
    }
    const codebase = providedCodebase !== null && providedCodebase !== void 0 ? providedCodebase : exports.DEFAULT_CODEBASE;
    validateCodebase(codebase);
    if (config.prefix) {
        validatePrefix(config.prefix);
    }
    const commonConfig = Object.assign({ codebase }, rest);
    if (source) {
        return Object.assign(Object.assign(Object.assign({}, commonConfig), { source }), (runtime ? { runtime } : {}));
    }
    else if (remoteSource) {
        if (!remoteSource.repository || !remoteSource.ref) {
            throw new error_1.FirebaseError("remoteSource requires 'repository' and 'ref' to be specified.");
        }
        if (!runtime) {
            // TODO: Once functions.yaml can provide a runtime, relax this requirement.
            throw new error_1.FirebaseError("functions.runtime is required when using remoteSource in firebase.json.");
        }
        return Object.assign(Object.assign({}, commonConfig), { remoteSource,
            runtime });
    }
    // Unreachable due to XOR guard
    throw new error_1.FirebaseError("Invalid functions config.");
}
/**
 * Check that the property is unique in the given config.
 */
function assertUnique(config, property, propval) {
    const values = new Set();
    if (propval) {
        values.add(propval);
    }
    for (const single of config) {
        const value = single[property];
        if (values.has(value)) {
            throw new error_1.FirebaseError(`functions.${property} must be unique but '${value}' was used more than once.`);
        }
        values.add(value);
    }
}
exports.assertUnique = assertUnique;
function assertUniqueSourcePrefixPair(config) {
    var _a;
    const sourcePrefixPairs = new Set();
    for (const c of config) {
        let sourceIdentifier;
        let sourceDescription;
        if (c.source) {
            sourceIdentifier = c.source;
            sourceDescription = `source directory ('${c.source}')`;
        }
        else if (c.remoteSource) {
            sourceIdentifier = `remote:${c.remoteSource.repository}#${c.remoteSource.ref}@dir:${c.remoteSource.dir || "."}`;
            sourceDescription = `remote source ('${c.remoteSource.repository}')`;
        }
        else {
            // This case should be prevented by `validateSingle`.
            continue;
        }
        const key = JSON.stringify({ source: sourceIdentifier, prefix: c.prefix || "" });
        if (sourcePrefixPairs.has(key)) {
            throw new error_1.FirebaseError(`More than one functions config specifies the same ${sourceDescription} and prefix ('${(_a = c.prefix) !== null && _a !== void 0 ? _a : ""}'). Please add a unique 'prefix' to each function configuration that shares this source to resolve the conflict.`);
        }
        sourcePrefixPairs.add(key);
    }
}
/**
 * Validate functions config.
 */
function validate(config) {
    const validated = config.map((cfg) => validateSingle(cfg));
    assertUnique(validated, "codebase");
    assertUniqueSourcePrefixPair(validated);
    return validated;
}
exports.validate = validate;
/**
 * Normalize and validate functions config.
 *
 * Valid functions config has exactly one config and has all required fields set.
 */
function normalizeAndValidate(config) {
    return validate(normalize(config));
}
exports.normalizeAndValidate = normalizeAndValidate;
/**
 * Return functions config for given codebase.
 */
function configForCodebase(config, codebase) {
    const codebaseCfg = config.find((c) => c.codebase === codebase);
    if (!codebaseCfg) {
        throw new error_1.FirebaseError(`No functions config found for codebase ${codebase}`);
    }
    return codebaseCfg;
}
exports.configForCodebase = configForCodebase;
/** Returns true if the codebase uses a local source. */
function isLocalConfig(c) {
    return c.source !== undefined;
}
exports.isLocalConfig = isLocalConfig;
/** Returns true if the codebase uses a remote source. */
function isRemoteConfig(c) {
    return c.remoteSource !== undefined;
}
exports.isRemoteConfig = isRemoteConfig;
/**
 * Require a local functions config. Throws a FirebaseError if the config is remote.
 * @param c The validated functions config entry.
 * @param purpose Optional message to use in the error.
 */
function requireLocal(c, purpose) {
    if (!isLocalConfig(c)) {
        const msg = purpose !== null && purpose !== void 0 ? purpose : "This operation requires a local functions source directory, but the codebase is configured with a remote source.";
        throw new error_1.FirebaseError(msg);
    }
    return c;
}
exports.requireLocal = requireLocal;
/**
 * Resolve the directory used for .env files.
 * - Local: returns `configDir` if set, otherwise `source`.
 * - Remote: returns `configDir` if set, otherwise `undefined`.
 */
function resolveConfigDir(c) {
    return c.configDir || c.source;
}
exports.resolveConfigDir = resolveConfigDir;
