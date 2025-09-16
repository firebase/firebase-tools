"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletesSummary = exports.configuresSummary = exports.updatesSummary = exports.createsSummary = exports.humanReadable = void 0;
const clc = require("colorette");
const refs = require("../../extensions/refs");
/**
 * humanReadable returns a human readable instanceID and reference
 * @param dep An instance spec to get the information from
 * @return a string indicating the instanceID and where it was installed from.
 */
const humanReadable = (dep) => `${clc.bold(dep.instanceId)} (${dep.ref ? `${refs.toExtensionVersionRef(dep.ref)}` : `Installed from local source`})`;
exports.humanReadable = humanReadable;
const humanReadableUpdate = (from, to) => {
    var _a;
    if (from.ref &&
        to.ref &&
        from.ref.publisherId === to.ref.publisherId &&
        from.ref.extensionId === to.ref.extensionId) {
        return `\t${clc.bold(from.instanceId)} (${refs.toExtensionVersionRef(from.ref)} => ${((_a = to.ref) === null || _a === void 0 ? void 0 : _a.version) || ""})`;
    }
    else {
        const fromRef = from.ref
            ? `${refs.toExtensionVersionRef(from.ref)}`
            : `Installed from local source`;
        const toRef = to.ref ? `${refs.toExtensionVersionRef(to.ref)}` : `Installed from local source`;
        return `\t${clc.bold(from.instanceId)} (${fromRef} => ${toRef})`;
    }
};
/**
 * createsSummary returns a formatted string of instance to be created.
 * @param toCreate a list of instances to create
 * @return a formatted string of instances to create.
 */
function createsSummary(toCreate) {
    const instancesToCreate = toCreate.map((s) => `\t${(0, exports.humanReadable)(s)}`).join("\n");
    return toCreate.length
        ? `The following extension instances will be created:\n${instancesToCreate}\n`
        : "";
}
exports.createsSummary = createsSummary;
/**
 * updatesSummary returns a formatted string of instances to be updated
 * @param toUpdate a list of instances to be updated
 * @param have a list of extensions that are deployed
 * @return a formatted string of instances to be updated
 */
function updatesSummary(toUpdate, have) {
    const instancesToUpdate = toUpdate
        .map((to) => {
        const from = have.find((exists) => exists.instanceId === to.instanceId);
        if (!from) {
            return "";
        }
        return humanReadableUpdate(from, to);
    })
        .join("\n");
    return toUpdate.length
        ? `The following extension instances will be updated:\n${instancesToUpdate}\n`
        : "";
}
exports.updatesSummary = updatesSummary;
/**
 * configureSummary shows a summary of what can be configured.
 * @param toConfigure The list of instances to configure
 * @return a formatted string of what will be configured
 */
function configuresSummary(toConfigure) {
    const instancesToConfigure = toConfigure.map((s) => `\t${(0, exports.humanReadable)(s)}`).join("\n");
    return toConfigure.length
        ? `The following extension instances will be configured:\n${instancesToConfigure}\n`
        : "";
}
exports.configuresSummary = configuresSummary;
/**
 * deleteSummary shows a summary of what can be deleted.
 * @param toDelete The list of instances that could be deleted
 * @param isDynamic If we are looking at extensions defined dynamically or not
 * @return A formatted string containing the instances to be deleted
 */
function deletesSummary(toDelete, isDynamic) {
    const instancesToDelete = toDelete.map((s) => `\t${(0, exports.humanReadable)(s)}`).join("\n");
    const definedLocation = isDynamic ? "your local source code" : "'firebase.json'";
    return toDelete.length
        ? `The following extension instances are found in your project but do not exist in ${definedLocation}:\n${instancesToDelete}\n`
        : "";
}
exports.deletesSummary = deletesSummary;
