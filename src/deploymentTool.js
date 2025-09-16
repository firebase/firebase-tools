"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFirebaseManaged = exports.labels = exports.value = exports.BASE = void 0;
exports.BASE = "cli-firebase";
function value() {
    if (!process.env.FIREBASE_DEPLOY_AGENT) {
        return exports.BASE;
    }
    return [exports.BASE, process.env.FIREBASE_DEPLOY_AGENT].join("--");
}
exports.value = value;
function labels() {
    return {
        "deployment-tool": value(),
    };
}
exports.labels = labels;
function isFirebaseManaged(labels) {
    return labels?.["deployment-tool"]?.startsWith(exports.BASE);
}
exports.isFirebaseManaged = isFirebaseManaged;
//# sourceMappingURL=deploymentTool.js.map