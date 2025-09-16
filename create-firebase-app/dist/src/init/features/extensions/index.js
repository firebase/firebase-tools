"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSetup = void 0;
const requirePermissions_1 = require("../../../requirePermissions");
const ensureApiEnabled_1 = require("../../../ensureApiEnabled");
const manifest = require("../../../extensions/manifest");
const api_1 = require("../../../api");
/**
 * Set up a new firebase project for extensions.
 */
async function doSetup(setup, config, options) {
    var _a, _b;
    const projectId = (_b = (_a = setup === null || setup === void 0 ? void 0 : setup.rcfile) === null || _a === void 0 ? void 0 : _a.projects) === null || _b === void 0 ? void 0 : _b.default;
    if (projectId) {
        await (0, requirePermissions_1.requirePermissions)(Object.assign(Object.assign({}, options), { project: projectId }));
        await Promise.all([(0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.extensionsOrigin)(), "unused", true)]);
    }
    return manifest.writeEmptyManifest(config, options);
}
exports.doSetup = doSetup;
