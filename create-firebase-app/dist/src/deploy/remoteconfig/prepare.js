"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const projectUtils_1 = require("../../projectUtils");
const loadCJSON_1 = require("../../loadCJSON");
const functions_1 = require("./functions");
const functions_2 = require("./functions");
async function default_1(context, options) {
    var _a;
    if (!context) {
        return;
    }
    const filePath = (_a = options.config.src.remoteconfig) === null || _a === void 0 ? void 0 : _a.template;
    if (!filePath) {
        return;
    }
    const template = (0, loadCJSON_1.loadCJSON)(filePath);
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    template.etag = await (0, functions_1.getEtag)(projectNumber);
    (0, functions_2.validateInputRemoteConfigTemplate)(template);
    context.remoteconfigTemplate = template;
    return;
}
exports.default = default_1;
