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
exports.ensureGIFApis = exports.ensureApis = void 0;
const api = __importStar(require("../api"));
const ensureApiEnabled_1 = require("../ensureApiEnabled");
const prefix = "dataconnect";
async function ensureApis(projectId, silent = false) {
    await Promise.all([
        (0, ensureApiEnabled_1.ensure)(projectId, api.dataconnectOrigin(), prefix, silent),
        (0, ensureApiEnabled_1.ensure)(projectId, api.cloudSQLAdminOrigin(), prefix, silent),
    ]);
}
exports.ensureApis = ensureApis;
async function ensureGIFApis(projectId) {
    await (0, ensureApiEnabled_1.ensure)(projectId, api.cloudAiCompanionOrigin(), prefix);
}
exports.ensureGIFApis = ensureGIFApis;
//# sourceMappingURL=ensureApis.js.map