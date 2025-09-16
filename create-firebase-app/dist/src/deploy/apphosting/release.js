"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ora = require("ora");
const api_1 = require("../../api");
const backend_1 = require("../../apphosting/backend");
const rollout_1 = require("../../apphosting/rollout");
const projectUtils_1 = require("../../projectUtils");
const utils_1 = require("../../utils");
/**
 * Orchestrates rollouts for the backends targeted for deployment.
 */
async function default_1(context, options) {
    if (context.backendConfigs.size === 0) {
        return;
    }
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const rollouts = [];
    const backendIds = [];
    for (const backendId of context.backendConfigs.keys()) {
        const config = context.backendConfigs.get(backendId);
        const location = context.backendLocations.get(backendId);
        const storageUri = context.backendStorageUris.get(backendId);
        if (!config || !location || !storageUri) {
            (0, utils_1.logLabeledWarning)("apphosting", `Failed to find metadata for backend ${backendId}. Please contact support with the contents of your firebase-debug.log to report your issue.`);
            continue;
        }
        backendIds.push(backendId);
        rollouts.push((0, rollout_1.orchestrateRollout)({
            projectId,
            location,
            backendId,
            buildInput: {
                source: {
                    archive: {
                        userStorageUri: storageUri,
                        rootDirectory: config.rootDir,
                    },
                },
            },
        }));
    }
    (0, utils_1.logLabeledBullet)("apphosting", `You may also track the rollout(s) at:\n\t${(0, api_1.consoleOrigin)()}/project/${projectId}/apphosting`);
    const rolloutsSpinner = ora(`Starting rollout(s) for backend(s) ${Array.from(context.backendConfigs.keys()).join(", ")}; this may take a few minutes. It's safe to exit now.\n`).start();
    const results = await Promise.allSettled(rollouts);
    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.status === "fulfilled") {
            const backend = await (0, backend_1.getBackend)(projectId, backendIds[i]);
            (0, utils_1.logLabeledSuccess)("apphosting", `Rollout for backend ${backendIds[i]} complete!`);
            (0, utils_1.logLabeledSuccess)("apphosting", `Your backend is now deployed at:\n\thttps://${backend.uri}`);
        }
        else {
            (0, utils_1.logLabeledWarning)("apphosting", `Rollout for backend ${backendIds[i]} failed.`);
            (0, utils_1.logLabeledError)("apphosting", res.reason);
        }
    }
    rolloutsSpinner.stop();
}
exports.default = default_1;
