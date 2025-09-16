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
exports.getRulesConfig = exports.normalizeRulesConfig = void 0;
const error_1 = require("../error");
const logger_1 = require("../logger");
const utils = __importStar(require("../utils"));
/**
 * Convert the relative paths in the config into absolute paths ready to be read.
 */
function normalizeRulesConfig(rulesConfig, options) {
    const config = options.config;
    return rulesConfig.map((rc) => {
        return {
            instance: rc.instance,
            rules: config.path(rc.rules),
        };
    });
}
exports.normalizeRulesConfig = normalizeRulesConfig;
function getRulesConfig(projectId, options) {
    const dbConfig = options.config.src.database;
    if (dbConfig === undefined) {
        return [];
    }
    const rc = options.rc;
    let allDatabases = !options.only;
    const onlyDatabases = new Set();
    if (options.only) {
        const split = options.only.split(",");
        if (split.includes("database")) {
            allDatabases = true;
        }
        else {
            for (const value of split) {
                if (value.startsWith("database:")) {
                    const target = value.split(":")[1];
                    onlyDatabases.add(target);
                }
            }
        }
    }
    if (!Array.isArray(dbConfig)) {
        if (dbConfig && dbConfig.rules) {
            utils.assertIsStringOrUndefined(options.instance);
            const instance = options.instance || `${options.project}-default-rtdb`;
            return [{ rules: dbConfig.rules, instance }];
        }
        else {
            logger_1.logger.debug("Possibly invalid database config: ", JSON.stringify(dbConfig));
            return [];
        }
    }
    const results = [];
    for (const c of dbConfig) {
        const { instance, target } = c;
        if (target) {
            if (allDatabases || onlyDatabases.has(target)) {
                // Make sure the target exists (this will throw otherwise)
                rc.requireTarget(projectId, "database", target);
                // Get a list of db instances the target maps to
                const instances = rc.target(projectId, "database", target);
                for (const i of instances) {
                    results.push({ instance: i, rules: c.rules });
                }
                onlyDatabases.delete(target);
            }
        }
        else if (instance) {
            if (allDatabases) {
                results.push(c);
            }
        }
        else {
            throw new error_1.FirebaseError('Must supply either "target" or "instance" in database config');
        }
    }
    if (!allDatabases && onlyDatabases.size !== 0) {
        throw new error_1.FirebaseError(`Could not find configurations in firebase.json for the following database targets: ${[
            ...onlyDatabases,
        ].join(", ")}`);
    }
    return results;
}
exports.getRulesConfig = getRulesConfig;
//# sourceMappingURL=rulesConfig.js.map