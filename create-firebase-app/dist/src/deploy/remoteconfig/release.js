"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("./functions");
const projectUtils_1 = require("../../projectUtils");
async function default_1(context, options) {
    if (!(context === null || context === void 0 ? void 0 : context.remoteconfigTemplate)) {
        return;
    }
    const template = context.remoteconfigTemplate;
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    const etag = await (0, functions_1.getEtag)(projectNumber);
    return (0, functions_1.publishTemplate)(projectNumber, template, etag, options);
}
exports.default = default_1;
