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
exports.doSetup = void 0;
const requirePermissions_1 = require("../../../requirePermissions");
const ensureApiEnabled_1 = require("../../../ensureApiEnabled");
const manifest = __importStar(require("../../../extensions/manifest"));
const api_1 = require("../../../api");
/**
 * Set up a new firebase project for extensions.
 */
async function doSetup(setup, config, options) {
    const projectId = setup?.rcfile?.projects?.default;
    if (projectId) {
        await (0, requirePermissions_1.requirePermissions)({ ...options, project: projectId });
        await Promise.all([(0, ensureApiEnabled_1.ensure)(projectId, (0, api_1.extensionsOrigin)(), "unused", true)]);
    }
    return manifest.writeEmptyManifest(config, options);
}
exports.doSetup = doSetup;
//# sourceMappingURL=index.js.map