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
exports.hostingConfig = exports.normalize = exports.resolveTargets = exports.validate = exports.extract = exports.filterExcept = exports.filterOnly = void 0;
const colorette_1 = require("colorette");
const utils_1 = require("../utils");
const error_1 = require("../error");
const functional_1 = require("../functional");
const fsutils_1 = require("../fsutils");
const projectPath_1 = require("../projectPath");
const path = __importStar(require("node:path"));
const logger_1 = require("../logger");
// assertMatches allows us to throw when an --only flag doesn't match a target
// but an --except flag doesn't. Is this desirable behavior?
function matchingConfigs(configs, targets, assertMatches) {
    const matches = [];
    const [hasSite, hasTarget] = (0, functional_1.partition)(configs, (c) => "site" in c);
    for (const target of targets) {
        const siteMatch = hasSite.find((c) => c.site === target);
        const targetMatch = hasTarget.find((c) => c.target === target);
        if (siteMatch) {
            matches.push(siteMatch);
        }
        else if (targetMatch) {
            matches.push(targetMatch);
        }
        else if (assertMatches) {
            throw new error_1.FirebaseError(`Hosting site or target ${(0, colorette_1.bold)(target)} not detected in firebase.json`);
        }
    }
    return matches;
}
/**
 * Returns a subset of configs that match the only string
 */
function filterOnly(configs, onlyString) {
    if (!onlyString) {
        return configs;
    }
    let onlyTargets = onlyString.split(",");
    // If an unqualified "hosting" is in the --only,
    // all hosting sites should be deployed.
    if (onlyTargets.includes("hosting")) {
        return configs;
    }
    // Strip out Hosting deploy targets from onlyTarget
    onlyTargets = onlyTargets
        .filter((target) => target.startsWith("hosting:"))
        .map((target) => target.replace("hosting:", ""));
    return matchingConfigs(configs, onlyTargets, /* assertMatch= */ true);
}
exports.filterOnly = filterOnly;
/**
 * Returns a subset of configs that match the except string;
 */
function filterExcept(configs, exceptOption) {
    if (!exceptOption) {
        return configs;
    }
    const exceptTargets = exceptOption.split(",");
    if (exceptTargets.includes("hosting")) {
        return [];
    }
    const exceptValues = exceptTargets
        .filter((t) => t.startsWith("hosting:"))
        .map((t) => t.replace("hosting:", ""));
    const toReject = matchingConfigs(configs, exceptValues, /* assertMatch= */ false);
    return configs.filter((c) => !toReject.find((r) => c.site === r.site && c.target === r.target));
}
exports.filterExcept = filterExcept;
/**
 * Verifies that input in firebase.json is sane
 * @param options options from the command library
 * @return a deep copy of validated configs
 */
function extract(options) {
    const config = options.config.src;
    if (!config.hosting) {
        return [];
    }
    const assertOneTarget = (config) => {
        if (config.target && config.site) {
            throw new error_1.FirebaseError(`Hosting configs should only include either "site" or "target", not both.`);
        }
    };
    if (!Array.isArray(config.hosting)) {
        // Upgrade the type because we pinky swear to ensure site exists as a backup.
        const res = (0, utils_1.cloneDeep)(config.hosting);
        // earlier the default RTDB instance was used as the hosting site
        // because it used to be created along with the Firebase project.
        // RTDB instance creation is now deferred and decoupled from project creation.
        // the fallback hosting site is now filled in through requireHostingSite.
        if (!res.target && !res.site) {
            // Fun fact. Site can be the empty string if someone just downloads code
            // and launches the emulator before configuring a project.
            res.site = options.site;
        }
        assertOneTarget(res);
        return [res];
    }
    else {
        config.hosting.forEach(assertOneTarget);
        return (0, utils_1.cloneDeep)(config.hosting);
    }
}
exports.extract = extract;
/** Validates hosting configs for semantic correctness. */
function validate(configs, options) {
    for (const config of configs) {
        validateOne(config, options);
    }
}
exports.validate = validate;
function validateOne(config, options) {
    // NOTE: a possible validation is to make sure site and target are not both
    // specified, but this expectation is broken after calling resolveTargets.
    // Thus that one validation is tucked into extract() where we know we haven't
    // resolved targets yet.
    const hasAnyStaticRewrites = !!config.rewrites?.find((rw) => "destination" in rw);
    const hasAnyDynamicRewrites = !!config.rewrites?.find((rw) => !("destination" in rw));
    const hasAnyRedirects = !!config.redirects?.length;
    if (config.source && config.public) {
        throw new error_1.FirebaseError('Can only specify "source" or "public" in a Hosting config, not both');
    }
    const root = config.source || config.public;
    if (!root && hasAnyStaticRewrites) {
        throw new error_1.FirebaseError(`Must supply a "public" or "source" directory when using "destination" rewrites.`);
    }
    if (!root && !hasAnyDynamicRewrites && !hasAnyRedirects) {
        throw new error_1.FirebaseError(`Must supply a "public" or "source" directory or at least one rewrite or redirect in each "hosting" config.`);
    }
    if (root && !(0, fsutils_1.dirExistsSync)((0, projectPath_1.resolveProjectPath)(options, root))) {
        logger_1.logger.debug(`Specified "${config.source ? "source" : "public"}" directory "${root}" does not exist; Deploy to Hosting site "${config.site || config.target || ""}" may fail or be empty.`);
    }
    // Using stupid types because type unions are painful sometimes
    const regionWithoutFunction = (rewrite) => typeof rewrite.region === "string" && typeof rewrite.function !== "string";
    const violation = config.rewrites?.find(regionWithoutFunction);
    if (violation) {
        throw new error_1.FirebaseError("Rewrites only support 'region' as a top-level field when 'function' is set as a string");
    }
    if (config.i18n) {
        if (!root) {
            throw new error_1.FirebaseError(`Must supply a "public" or "source" directory when using "i18n" configuration.`);
        }
        if (!config.i18n.root) {
            throw new error_1.FirebaseError('Must supply a "root" in "i18n" config.');
        }
        const i18nPath = path.join(root, config.i18n.root);
        if (!(0, fsutils_1.dirExistsSync)((0, projectPath_1.resolveProjectPath)(options, i18nPath))) {
            (0, utils_1.logLabeledWarning)("hosting", `Couldn't find specified i18n root directory ${(0, colorette_1.bold)(config.i18n.root)} in public directory ${(0, colorette_1.bold)(root)}`);
        }
    }
}
/**
 * Converts all configs from having a target to having a source
 */
function resolveTargets(configs, options) {
    return configs.map((config) => {
        const newConfig = (0, utils_1.cloneDeep)(config);
        if (config.site) {
            return newConfig;
        }
        if (!config.target) {
            throw new error_1.FirebaseError("Assertion failed: resolving hosting target of a site with no site name " +
                "or target name. This should have caused an error earlier", { exit: 2 });
        }
        if (!options.project) {
            throw new error_1.FirebaseError("Assertion failed: options.project is not set. Commands depending on hosting.config should use requireProject", { exit: 2 });
        }
        const matchingTargets = options.rc.requireTarget(options.project, "hosting", config.target);
        if (matchingTargets.length > 1) {
            throw new error_1.FirebaseError(`Hosting target ${(0, colorette_1.bold)(config.target)} is linked to multiple sites, ` +
                `but only one is permitted. ` +
                `To clear, run:\n\n  ${(0, colorette_1.bold)(`firebase target:clear hosting ${config.target}`)}`);
        }
        newConfig.site = matchingTargets[0];
        return newConfig;
    });
}
exports.resolveTargets = resolveTargets;
function isLegacyFunctionsRewrite(rewrite) {
    return "function" in rewrite && typeof rewrite.function === "string";
}
/**
 * Ensures that all configs are of a single modern format
 */
function normalize(configs) {
    for (const config of configs) {
        config.rewrites = config.rewrites?.map((rewrite) => {
            if (!("function" in rewrite)) {
                return rewrite;
            }
            if (isLegacyFunctionsRewrite(rewrite)) {
                const modern = {
                    // Note: this copied in a bad "function" and "rewrite" in this splat
                    // we'll overwrite function and delete rewrite.
                    ...rewrite,
                    function: {
                        functionId: rewrite.function,
                        // Do not set pinTag so we can track how often it is used
                    },
                };
                delete modern.region;
                if ("region" in rewrite && typeof rewrite.region === "string") {
                    modern.function.region = rewrite.region;
                }
                if (rewrite.region) {
                    modern.function.region = rewrite.region;
                }
                return modern;
            }
            return rewrite;
        });
    }
}
exports.normalize = normalize;
/**
 * Extract a validated normalized set of Hosting configs from the command options.
 * This also resolves targets, so it is not suitable for the emulator.
 */
function hostingConfig(options) {
    if (!options.normalizedHostingConfig) {
        let configs = extract(options);
        configs = filterOnly(configs, options.only);
        configs = filterExcept(configs, options.except);
        normalize(configs);
        validate(configs, options);
        // N.B. We're calling resolveTargets after filterOnly/except, which means
        // we won't recognize a --only <site> when the config has a target.
        // This is the way I found this code and should bring up to others whether
        // we should change the behavior.
        const resolved = resolveTargets(configs, options);
        options.normalizedHostingConfig = resolved;
    }
    return options.normalizedHostingConfig;
}
exports.hostingConfig = hostingConfig;
//# sourceMappingURL=config.js.map