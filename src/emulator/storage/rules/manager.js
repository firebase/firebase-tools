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
exports.createStorageRulesManager = void 0;
const chokidar = __importStar(require("chokidar"));
const emulatorLogger_1 = require("../../emulatorLogger");
const types_1 = require("../../types");
const runtime_1 = require("./runtime");
const fsutils_1 = require("../../../fsutils");
/**
 * Creates either a {@link DefaultStorageRulesManager} to manage rules for all resources or a
 * {@link ResourceBasedStorageRulesManager} for a subset of them, keyed by resource name.
 */
function createStorageRulesManager(rules, runtime) {
    return Array.isArray(rules)
        ? new ResourceBasedStorageRulesManager(rules, runtime)
        : new DefaultStorageRulesManager(rules, runtime);
}
exports.createStorageRulesManager = createStorageRulesManager;
/**
 * Maintains a {@link StorageRulesetInstance} for a given source file. Listens for changes to the
 * file and updates the ruleset accordingly.
 */
class DefaultStorageRulesManager {
    constructor(_rules, _runtime) {
        this._runtime = _runtime;
        this._watcher = new chokidar.FSWatcher();
        this._logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.STORAGE);
        this._rules = _rules;
    }
    async start() {
        const issues = await this.loadRuleset();
        this.updateWatcher(this._rules.name);
        return issues;
    }
    getRuleset() {
        return this._ruleset;
    }
    async stop() {
        await this._watcher.close();
    }
    updateWatcher(rulesFile) {
        this._watcher = chokidar
            .watch(rulesFile, { persistent: true, ignoreInitial: true })
            .on("change", async () => {
            // There have been some race conditions reported (on Windows) where reading the
            // file too quickly after the watcher fires results in an empty file being read.
            // Adding a small delay prevents that at very little cost.
            await new Promise((res) => setTimeout(res, 5));
            this._logger.logLabeled("BULLET", "storage", "Change detected, updating rules for Cloud Storage...");
            this._rules.content = (0, fsutils_1.readFile)(rulesFile);
            await this.loadRuleset();
        });
    }
    async loadRuleset() {
        const { ruleset, issues } = await this._runtime.loadRuleset({ files: [this._rules] });
        if (ruleset) {
            this._ruleset = ruleset;
            return issues;
        }
        issues.all.forEach((issue) => {
            try {
                const parsedIssue = JSON.parse(issue);
                this._logger.log("WARN", `${parsedIssue.description_.replace(/\.$/, "")} in ${parsedIssue.sourcePosition_.fileName_}:${parsedIssue.sourcePosition_.line_}`);
            }
            catch {
                this._logger.logLabeled("WARN", "storage", issue);
            }
        });
        return issues;
    }
}
/**
 * Maintains a mapping from storage resource to {@link DefaultStorageRulesManager} and
 * directs calls to the appropriate instance.
 */
class ResourceBasedStorageRulesManager {
    constructor(_rulesConfig, _runtime) {
        this._runtime = _runtime;
        this._rulesManagers = new Map();
        for (const { resource, rules } of _rulesConfig) {
            this.createRulesManager(resource, rules);
        }
    }
    async start() {
        const allIssues = new runtime_1.StorageRulesIssues();
        for (const rulesManager of this._rulesManagers.values()) {
            allIssues.extend(await rulesManager.start());
        }
        return allIssues;
    }
    getRuleset(resource) {
        return this._rulesManagers.get(resource)?.getRuleset();
    }
    async stop() {
        await Promise.all(Array.from(this._rulesManagers.values(), async (rulesManager) => await rulesManager.stop()));
    }
    createRulesManager(resource, rules) {
        const rulesManager = new DefaultStorageRulesManager(rules, this._runtime);
        this._rulesManagers.set(resource, rulesManager);
        return rulesManager;
    }
}
//# sourceMappingURL=manager.js.map