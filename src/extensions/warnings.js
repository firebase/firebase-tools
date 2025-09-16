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
exports.outOfBandChangesWarning = exports.displayWarningsForDeploy = void 0;
const clc = __importStar(require("colorette"));
const extensionsHelper_1 = require("./extensionsHelper");
const deploymentSummary_1 = require("../deploy/extensions/deploymentSummary");
const planner_1 = require("../deploy/extensions/planner");
const logger_1 = require("../logger");
const utils = __importStar(require("../utils"));
const toListEntry = (i) => {
    const idAndRef = (0, deploymentSummary_1.humanReadable)(i);
    const sourceCodeLink = `\n\t[Source Code](${i.extensionVersion?.buildSourceUri ?? i.extensionVersion?.sourceDownloadUri})`;
    const githubLink = i.extensionVersion?.spec?.sourceUrl
        ? `\n\t[Publisher Contact](${i.extensionVersion?.spec.sourceUrl})`
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
    const unpublishedExtensions = uploadedExtensionInstances.filter((i) => i.extensionVersion?.listing?.state !== "APPROVED");
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
//# sourceMappingURL=warnings.js.map