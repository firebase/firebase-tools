"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesDeploy = exports.RulesetServiceType = void 0;
const _ = require("lodash");
const colorette_1 = require("colorette");
const fs = require("fs-extra");
const gcp = require("./gcp");
const logger_1 = require("./logger");
const error_1 = require("./error");
const utils = require("./utils");
const prompt_1 = require("./prompt");
const getProjectNumber_1 = require("./getProjectNumber");
const resourceManager_1 = require("./gcp/resourceManager");
// The status code the Firebase Rules backend sends to indicate too many rulesets.
const QUOTA_EXCEEDED_STATUS_CODE = 429;
// How many old rulesets is enough to cause problems?
const RULESET_COUNT_LIMIT = 1000;
// how many old rulesets should we delete to free up quota?
const RULESETS_TO_GC = 10;
// Cross service function definition regex
const CROSS_SERVICE_FUNCTIONS = /firestore\.(get|exists)/;
// Cross service rules for Storage role
const CROSS_SERVICE_RULES_ROLE = "roles/firebaserules.firestoreServiceAgent";
/**
 * Services that have rulesets.
 */
var RulesetServiceType;
(function (RulesetServiceType) {
    RulesetServiceType["CLOUD_FIRESTORE"] = "cloud.firestore";
    RulesetServiceType["FIREBASE_STORAGE"] = "firebase.storage";
})(RulesetServiceType = exports.RulesetServiceType || (exports.RulesetServiceType = {}));
/**
 * Printable names of RulesetServiceTypes.
 */
const RulesetType = {
    [RulesetServiceType.CLOUD_FIRESTORE]: "firestore",
    [RulesetServiceType.FIREBASE_STORAGE]: "storage",
};
/**
 * RulesDeploy encapsulates logic for deploying rules.
 */
class RulesDeploy {
    /**
     * Creates a RulesDeploy instance.
     * @param options The CLI options object.
     * @param type The service type for which this ruleset is associated.
     */
    constructor(options, type) {
        this.options = options;
        this.type = type;
        this.project = options.project;
        this.rulesFiles = {};
        this.rulesetNames = {};
    }
    /**
     * Adds a new project-relative file to be included in compilation and
     * deployment for this RulesDeploy.
     * @param path path of file to be included.
     */
    addFile(path) {
        const fullPath = this.options.config.path(path);
        let src;
        try {
            src = fs.readFileSync(fullPath, "utf8");
        }
        catch (e) {
            logger_1.logger.debug("[rules read error]", e.stack);
            throw new error_1.FirebaseError(`Error reading rules file ${(0, colorette_1.bold)(path)}`);
        }
        this.rulesFiles[path] = [{ name: path, content: src }];
    }
    /**
     * Compile all rulesets tied to this deploy, rejecting on first
     * compilation error.
     */
    async compile() {
        await Promise.all(Object.keys(this.rulesFiles).map((filename) => {
            return this.compileRuleset(filename, this.rulesFiles[filename]);
        }));
    }
    /**
     * Returns the latest ruleset's name and content.
     * @param service The service to fetch the rulesets.
     * @return An object containing the latest name and content of the current rules.
     */
    async getCurrentRules(service) {
        const latestName = await gcp.rules.getLatestRulesetName(this.options.project, service);
        let latestContent = null;
        if (latestName) {
            latestContent = await gcp.rules.getRulesetContent(latestName);
        }
        return { latestName, latestContent };
    }
    async checkStorageRulesIamPermissions(rulesContent) {
        // Skip if no cross-service rules
        if ((rulesContent === null || rulesContent === void 0 ? void 0 : rulesContent.match(CROSS_SERVICE_FUNCTIONS)) === null) {
            return;
        }
        // Skip if non-interactive
        if (this.options.nonInteractive) {
            return;
        }
        // We have cross-service rules. Now check the P4SA permission
        const projectNumber = await (0, getProjectNumber_1.getProjectNumber)(this.options);
        const saEmail = `service-${projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
        try {
            if (await (0, resourceManager_1.serviceAccountHasRoles)(projectNumber, saEmail, [CROSS_SERVICE_RULES_ROLE], true)) {
                return;
            }
            // Prompt user to ask if they want to add the service account
            const addRole = await (0, prompt_1.confirm)({
                message: `Cloud Storage for Firebase needs an IAM Role to use cross-service rules. Grant the new role?`,
                default: true,
                force: this.options.force,
            });
            // Try to add the role to the service account
            if (addRole) {
                await (0, resourceManager_1.addServiceAccountToRoles)(projectNumber, saEmail, [CROSS_SERVICE_RULES_ROLE], true);
                utils.logLabeledBullet(RulesetType[this.type], "updated service account for cross-service rules...");
            }
        }
        catch (e) {
            logger_1.logger.warn("[rules] Error checking or updating Cloud Storage for Firebase service account permissions.");
            logger_1.logger.warn("[rules] Cross-service Storage rules may not function properly", e.message);
        }
    }
    /**
     * Create rulesets for each file added to this deploy, and record
     * the name for use in the release process later.
     *
     * If the ruleset to create is identical to the latest existing ruleset,
     * then we record the existing ruleset name instead of creating a duplicate.
     *
     * @param service The service to create a ruleset.
     * @return All the names of the rulesets that were created.
     */
    async createRulesets(service) {
        var _a;
        const createdRulesetNames = [];
        const { latestName: latestRulesetName, latestContent: latestRulesetContent } = await this.getCurrentRules(service);
        // TODO: Make this into a more useful helper method.
        // Gather the files to be uploaded.
        const newRulesetsByFilename = new Map();
        for (const [filename, files] of Object.entries(this.rulesFiles)) {
            if (latestRulesetName && _.isEqual(files, latestRulesetContent)) {
                utils.logLabeledBullet(RulesetType[this.type], `latest version of ${(0, colorette_1.bold)(filename)} already up to date, skipping upload...`);
                this.rulesetNames[filename] = latestRulesetName;
                continue;
            }
            if (service === RulesetServiceType.FIREBASE_STORAGE) {
                await this.checkStorageRulesIamPermissions((_a = files[0]) === null || _a === void 0 ? void 0 : _a.content);
            }
            utils.logLabeledBullet(RulesetType[this.type], `uploading rules ${(0, colorette_1.bold)(filename)}...`);
            newRulesetsByFilename.set(filename, gcp.rules.createRuleset(this.options.project, files));
        }
        try {
            await Promise.all(newRulesetsByFilename.values());
            // All the values are now resolves, so `await` here reads the strings.
            for (const [filename, rulesetName] of newRulesetsByFilename) {
                this.rulesetNames[filename] = await rulesetName;
                createdRulesetNames.push(await rulesetName);
            }
        }
        catch (err) {
            if ((0, error_1.getErrStatus)(err) !== QUOTA_EXCEEDED_STATUS_CODE) {
                throw err;
            }
            utils.logLabeledBullet(RulesetType[this.type], "quota exceeded error while uploading rules");
            const history = await gcp.rules.listAllRulesets(this.options.project);
            if (history.length > RULESET_COUNT_LIMIT) {
                const confirmed = await (0, prompt_1.confirm)({
                    message: `You have ${history.length} rules, do you want to delete the oldest ${RULESETS_TO_GC} to free up space?`,
                    force: this.options.force,
                });
                if (confirmed) {
                    // Find the oldest unreleased rulesets. The rulesets are sorted reverse-chronlogically.
                    const releases = await gcp.rules.listAllReleases(this.options.project);
                    const unreleased = history.filter((ruleset) => {
                        return !releases.find((release) => release.rulesetName === ruleset.name);
                    });
                    const entriesToDelete = unreleased.reverse().slice(0, RULESETS_TO_GC);
                    // To avoid running into quota issues, delete entries in _serial_ rather than parallel.
                    for (const entry of entriesToDelete) {
                        await gcp.rules.deleteRuleset(this.options.project, gcp.rules.getRulesetId(entry));
                        logger_1.logger.debug(`[rules] Deleted ${entry.name}`);
                    }
                    utils.logLabeledWarning(RulesetType[this.type], "retrying rules upload");
                    return this.createRulesets(service);
                }
            }
        }
        return createdRulesetNames;
    }
    /**
     * Releases the rules from the given file and resource name.
     * @param filename The filename to release.
     * @param resourceName The release name to release these as.
     * @param subResourceName An optional sub-resource name to append to the
     *   release name. This is required if resourceName === FIREBASE_STORAGE.
     */
    async release(filename, resourceName, subResourceName) {
        // Cast as a RulesetServiceType to test the value against known types.
        if (resourceName === RulesetServiceType.FIREBASE_STORAGE && !subResourceName) {
            throw new error_1.FirebaseError(`Cannot release resource type "${resourceName}"`);
        }
        await gcp.rules.updateOrCreateRelease(this.options.project, this.rulesetNames[filename], subResourceName ? `${resourceName}/${subResourceName}` : resourceName);
        utils.logLabeledSuccess(RulesetType[this.type], `released rules ${(0, colorette_1.bold)(filename)} to ${(0, colorette_1.bold)(resourceName)}`);
    }
    /**
     * Attempts to compile a ruleset.
     * @param filename The filename to compile.
     * @param files The files to compile.
     */
    async compileRuleset(filename, files) {
        utils.logLabeledBullet(this.type, `checking ${(0, colorette_1.bold)(filename)} for compilation errors...`);
        const response = await gcp.rules.testRuleset(this.options.project, files);
        if (_.get(response, "body.issues", []).length) {
            const warnings = [];
            const errors = [];
            response.body.issues.forEach((issue) => {
                const issueMessage = `[${issue.severity.substring(0, 1)}] ${issue.sourcePosition.line}:${issue.sourcePosition.column} - ${issue.description}`;
                if (issue.severity === "ERROR") {
                    errors.push(issueMessage);
                }
                else {
                    warnings.push(issueMessage);
                }
            });
            if (warnings.length > 0) {
                warnings.forEach((warning) => {
                    utils.logWarning(warning);
                });
            }
            if (errors.length > 0) {
                const add = errors.length === 1 ? "" : "s";
                const message = `Compilation error${add} in ${(0, colorette_1.bold)(filename)}:\n${errors.join("\n")}`;
                throw new error_1.FirebaseError(message, { exit: 1 });
            }
        }
        utils.logLabeledSuccess(this.type, `rules file ${(0, colorette_1.bold)(filename)} compiled successfully`);
    }
}
exports.RulesDeploy = RulesDeploy;
