"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.outOfBandChangesWarning = exports.displayWarningsForDeploy = void 0;
const clc = require("colorette");
const extensionsHelper_1 = require("./extensionsHelper");
const deploymentSummary_1 = require("../deploy/extensions/deploymentSummary");
const planner_1 = require("../deploy/extensions/planner");
const logger_1 = require("../logger");
const utils = require("../utils");
const toListEntry = (i) => {
    var _a, _b, _c, _d, _e, _f;
    const idAndRef = (0, deploymentSummary_1.humanReadable)(i);
    const sourceCodeLink = `\n\t[Source Code](${(_b = (_a = i.extensionVersion) === null || _a === void 0 ? void 0 : _a.buildSourceUri) !== null && _b !== void 0 ? _b : (_c = i.extensionVersion) === null || _c === void 0 ? void 0 : _c.sourceDownloadUri})`;
    const githubLink = ((_e = (_d = i.extensionVersion) === null || _d === void 0 ? void 0 : _d.spec) === null || _e === void 0 ? void 0 : _e.sourceUrl)
        ? `\n\t[Publisher Contact](${(_f = i.extensionVersion) === null || _f === void 0 ? void 0 : _f.spec.sourceUrl})`
        : "";
    return `${idAndRef}${sourceCodeLink}${githubLink}`;
};
/**
 * Display a single, grouped warning about extension status for all instances in a deployment.
 * Returns true if any instances triggered a warning.
 * @param instancesToCreate A list of instances that will be created in this deploy
 */
async function displayWarningsForDeploy(instancesToCreate) {
    const uploadedExtensionInstances = instancesToCreate.filter((i) => i.ref);
    for (const i of uploadedExtensionInstances) {
        await (0, planner_1.getExtensionVersion)(i);
    }
    const unpublishedExtensions = uploadedExtensionInstances.filter((i) => { var _a, _b; return ((_b = (_a = i.extensionVersion) === null || _a === void 0 ? void 0 : _a.listing) === null || _b === void 0 ? void 0 : _b.state) !== "APPROVED"; });
    if (unpublishedExtensions.length) {
        const humanReadableList = unpublishedExtensions.map(toListEntry).join("\n");
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, `The following extension versions have not been published to the Firebase Extensions Hub:\n${humanReadableList}\n.` +
            "Unpublished extensions have not been reviewed by " +
            "Firebase. Please make sure you trust the extension publisher before installing this extension.");
    }
    return unpublishedExtensions.length > 0;
}
exports.displayWarningsForDeploy = displayWarningsForDeploy;
function outOfBandChangesWarning(instanceIds, isDynamic) {
    const extra = isDynamic
        ? ""
        : " To avoid this, run `firebase ext:export` to sync these changes to your local extensions manifest.";
    logger_1.logger.warn("The following instances may have been changed in the Firebase console or by another machine since the last deploy from this machine.\n\t" +
        clc.bold(instanceIds.join("\n\t")) +
        `\nIf you proceed with this deployment, those changes will be overwritten.${extra}`);
}
exports.outOfBandChangesWarning = outOfBandChangesWarning;
