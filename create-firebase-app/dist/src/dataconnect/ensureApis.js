"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGIFApis = exports.ensureApis = void 0;
const api = require("../api");
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
