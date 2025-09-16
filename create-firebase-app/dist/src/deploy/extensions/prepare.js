"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepare = exports.prepareDynamicExtensions = void 0;
const planner = require("./planner");
const deploymentSummary = require("./deploymentSummary");
const prompt = require("../../prompt");
const refs = require("../../extensions/refs");
const projectUtils_1 = require("../../projectUtils");
const logger_1 = require("../../logger");
const error_1 = require("../../error");
const requirePermissions_1 = require("../../requirePermissions");
const extensionsHelper_1 = require("../../extensions/extensionsHelper");
const secretsUtils_1 = require("../../extensions/secretsUtils");
const secrets_1 = require("./secrets");
const warnings_1 = require("../../extensions/warnings");
const etags_1 = require("../../extensions/etags");
const v2FunctionHelper_1 = require("./v2FunctionHelper");
const tos_1 = require("../../extensions/tos");
const common_1 = require("../../extensions/runtimes/common");
const functionsDeployHelper_1 = require("../functions/functionsDeployHelper");
const matchesInstanceId = (dep) => (test) => {
    return dep.instanceId === test.instanceId;
};
const isUpdate = (dep) => (test) => {
    return dep.instanceId === test.instanceId && !refs.equal(dep.ref, test.ref);
};
const isConfigure = (dep) => (test) => {
    return dep.instanceId === test.instanceId && refs.equal(dep.ref, test.ref);
};
// This is called by prepare and also prepareDynamicExtensions
async function prepareHelper(context, options, payload, wantExtensions, haveExtensions, isDynamic) {
    var _a, _b;
    const projectId = (0, projectUtils_1.needProjectId)(options);
    context.want = wantExtensions;
    context.have = haveExtensions;
    const etagsChanged = (0, etags_1.detectEtagChanges)(options.rc, projectId, context.have);
    if (etagsChanged.length) {
        // We only care about changed eTags for things we are going to deploy
        const wantChangedIds = wantExtensions
            .map((e) => e.instanceId)
            .filter((id) => etagsChanged.includes(id));
        if (wantChangedIds.length) {
            (0, warnings_1.outOfBandChangesWarning)(wantChangedIds, isDynamic);
            if (!(await prompt.confirm({
                message: `Do you wish to continue deploying these extension instances?`,
                default: false,
                nonInteractive: options.nonInteractive,
                force: options.force,
            }))) {
                throw new error_1.FirebaseError("Deployment cancelled");
            }
        }
    }
    // Check if any extension instance that we want is using secrets,
    // and ensure the API is enabled if so.
    const usingSecrets = await Promise.all((_a = context.want) === null || _a === void 0 ? void 0 : _a.map(secrets_1.checkSpecForSecrets));
    if (usingSecrets.some((i) => i)) {
        await (0, secretsUtils_1.ensureSecretManagerApiEnabled)(options);
    }
    const usingV2Functions = await Promise.all((_b = context.want) === null || _b === void 0 ? void 0 : _b.map(v2FunctionHelper_1.checkSpecForV2Functions));
    if (usingV2Functions) {
        await (0, v2FunctionHelper_1.ensureNecessaryV2ApisAndRoles)(options);
    }
    payload.instancesToCreate = context.want.filter((i) => { var _a; return !((_a = context.have) === null || _a === void 0 ? void 0 : _a.some(matchesInstanceId(i))); });
    payload.instancesToConfigure = context.want.filter((i) => { var _a; return (_a = context.have) === null || _a === void 0 ? void 0 : _a.some(isConfigure(i)); });
    payload.instancesToUpdate = context.want.filter((i) => { var _a; return (_a = context.have) === null || _a === void 0 ? void 0 : _a.some(isUpdate(i)); });
    payload.instancesToDelete = context.have.filter((i) => { var _a; return !((_a = context.want) === null || _a === void 0 ? void 0 : _a.some(matchesInstanceId(i))); });
    if (await (0, warnings_1.displayWarningsForDeploy)(payload.instancesToCreate)) {
        if (!(await prompt.confirm({
            message: `Do you wish to continue deploying these extension instances?`,
            default: true,
            nonInteractive: options.nonInteractive,
            force: options.force,
        }))) {
            throw new error_1.FirebaseError("Deployment cancelled");
        }
    }
    const permissionsNeeded = [];
    if (payload.instancesToCreate.length) {
        permissionsNeeded.push("firebaseextensions.instances.create");
        logger_1.logger.info(deploymentSummary.createsSummary(payload.instancesToCreate));
    }
    if (payload.instancesToUpdate.length) {
        permissionsNeeded.push("firebaseextensions.instances.update");
        logger_1.logger.info(deploymentSummary.updatesSummary(payload.instancesToUpdate, context.have));
    }
    if (payload.instancesToConfigure.length) {
        permissionsNeeded.push("firebaseextensions.instances.update");
        logger_1.logger.info(deploymentSummary.configuresSummary(payload.instancesToConfigure));
    }
    if (payload.instancesToDelete.length) {
        logger_1.logger.info(deploymentSummary.deletesSummary(payload.instancesToDelete, isDynamic));
        if (options.dryRun) {
            logger_1.logger.info("On your next deploy, you will be asked if you want to delete these instances.");
            logger_1.logger.info("If you deploy --force, they will be deleted.");
        }
        if (!options.dryRun &&
            !(await prompt.confirm({
                message: `Would you like to delete ${payload.instancesToDelete
                    .map((i) => i.instanceId)
                    .join(", ")}?`,
                default: false,
                nonInteractive: options.nonInteractive,
                force: options.force,
            }))) {
            payload.instancesToDelete = [];
        }
        else {
            permissionsNeeded.push("firebaseextensions.instances.delete");
        }
    }
    await (0, requirePermissions_1.requirePermissions)(options, permissionsNeeded);
    if (options.dryRun) {
        const appDevTos = await (0, tos_1.getAppDeveloperTOSStatus)(projectId);
        if (!appDevTos.lastAcceptedVersion) {
            logger_1.logger.info("On your next deploy, you will be asked to accept the Firebase Extensions App Developer Terms of Service");
        }
    }
    else {
        await (0, tos_1.acceptLatestAppDeveloperTOS)(options, projectId, context.want.map((i) => i.instanceId));
    }
}
/**
 * This is called by functions/prepare so we can deploy the extensions defined by SDKs
 * @param context The prepare context
 * @param options The prepare options
 * @param payload The prepare payload
 * @param builds firebase functions builds
 */
async function prepareDynamicExtensions(context, options, payload, builds) {
    const filters = (0, functionsDeployHelper_1.getEndpointFilters)(options);
    const extensions = (0, common_1.extractExtensionsFromBuilds)(builds, filters);
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    await (0, extensionsHelper_1.ensureExtensionsApiEnabled)(options);
    await (0, requirePermissions_1.requirePermissions)(options, ["firebaseextensions.instances.list"]);
    let haveExtensions = await planner.haveDynamic(projectId);
    haveExtensions = haveExtensions.filter((e) => { var _a; return (0, common_1.extensionMatchesAnyFilter)((_a = e.labels) === null || _a === void 0 ? void 0 : _a.codebase, e.instanceId, filters); });
    if (Object.keys(extensions).length === 0 && haveExtensions.length === 0) {
        // Nothing defined, and nothing to delete
        return;
    }
    const dynamicWant = await planner.wantDynamic({
        projectId,
        projectNumber,
        extensions,
    });
    return prepareHelper(context, options, payload, dynamicWant, haveExtensions, true /* isDynamic */);
}
exports.prepareDynamicExtensions = prepareDynamicExtensions;
/**
 * static Extensions prepare (not to be confused with dynamic extensions)
 * @param context The prepare context
 * @param options The prepare options
 * @param payload The prepare payload
 */
async function prepare(context, options, payload) {
    context.extensionsStartTime = Date.now();
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    const aliases = (0, projectUtils_1.getAliases)(options, projectId);
    const projectDir = options.config.projectDir;
    await (0, extensionsHelper_1.ensureExtensionsApiEnabled)(options);
    await (0, requirePermissions_1.requirePermissions)(options, ["firebaseextensions.instances.list"]);
    const wantExtensions = await planner.want({
        projectId,
        projectNumber,
        aliases,
        projectDir,
        extensions: options.config.get("extensions", {}),
    });
    const haveExtensions = await planner.have(projectId);
    return prepareHelper(context, options, payload, wantExtensions, haveExtensions, false /* isDynamic */);
}
exports.prepare = prepare;
