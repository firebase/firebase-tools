"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectEtagChanges = exports.saveEtags = void 0;
function saveEtags(rc, projectId, instances) {
    rc.setEtags(projectId, "extensionInstances", etagsMap(instances));
}
exports.saveEtags = saveEtags;
// detectEtagChanges compares the last set of etags stored in .firebaserc to the currently deployed etags,
// and returns the ids on any instances have different etags.
function detectEtagChanges(rc, projectId, instances) {
    const lastDeployedEtags = rc.getEtags(projectId).extensionInstances;
    const currentEtags = etagsMap(instances);
    // If we don't have a record of the last deployed state, detect no changes.
    if (!lastDeployedEtags || !Object.keys(lastDeployedEtags).length) {
        return [];
    }
    // find any instances that changed since last deploy
    const changedExtensionInstances = Object.entries(lastDeployedEtags)
        .filter(([instanceName, etag]) => etag !== currentEtags[instanceName])
        .map((i) => i[0]);
    // find any instances that we installed out of band since last deploy
    const newExtensionInstances = Object.keys(currentEtags).filter((instanceName) => !lastDeployedEtags[instanceName]);
    return newExtensionInstances.concat(changedExtensionInstances);
}
exports.detectEtagChanges = detectEtagChanges;
function etagsMap(instances) {
    return instances.reduce((acc, i) => {
        if (i.etag) {
            acc[i.instanceId] = i.etag;
        }
        return acc;
    }, {});
}
//# sourceMappingURL=etags.js.map