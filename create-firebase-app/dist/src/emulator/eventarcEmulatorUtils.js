"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudEventFromProtoToJson = void 0;
const error_1 = require("../error");
const BUILT_IN_ATTRS = ["time", "datacontenttype", "subject"];
function cloudEventFromProtoToJson(ce) {
    if (ce["id"] === undefined) {
        throw new error_1.FirebaseError("CloudEvent 'id' is required.");
    }
    if (ce["type"] === undefined) {
        throw new error_1.FirebaseError("CloudEvent 'type' is required.");
    }
    if (ce["specVersion"] === undefined) {
        throw new error_1.FirebaseError("CloudEvent 'specVersion' is required.");
    }
    if (ce["source"] === undefined) {
        throw new error_1.FirebaseError("CloudEvent 'source' is required.");
    }
    const out = {
        id: ce["id"],
        type: ce["type"],
        specversion: ce["specVersion"],
        source: ce["source"],
        subject: getOptionalAttribute(ce, "subject", "ceString"),
        time: getRequiredAttribute(ce, "time", "ceTimestamp"),
        data: getData(ce),
        datacontenttype: getRequiredAttribute(ce, "datacontenttype", "ceString"),
    };
    for (const attr in ce["attributes"]) {
        if (BUILT_IN_ATTRS.includes(attr)) {
            continue;
        }
        out[attr] = getRequiredAttribute(ce, attr, "ceString");
    }
    return out;
}
exports.cloudEventFromProtoToJson = cloudEventFromProtoToJson;
function getOptionalAttribute(ce, attr, type) {
    var _a, _b;
    return (_b = (_a = ce === null || ce === void 0 ? void 0 : ce["attributes"]) === null || _a === void 0 ? void 0 : _a[attr]) === null || _b === void 0 ? void 0 : _b[type];
}
function getRequiredAttribute(ce, attr, type) {
    var _a, _b;
    const val = (_b = (_a = ce === null || ce === void 0 ? void 0 : ce["attributes"]) === null || _a === void 0 ? void 0 : _a[attr]) === null || _b === void 0 ? void 0 : _b[type];
    if (val === undefined) {
        throw new error_1.FirebaseError("CloudEvent must contain " + attr + " attribute");
    }
    return val;
}
function getData(ce) {
    const contentType = getRequiredAttribute(ce, "datacontenttype", "ceString");
    switch (contentType) {
        case "application/json":
            return JSON.parse(ce["textData"]);
        case "text/plain":
            return ce["textData"];
        case undefined:
            return undefined;
        default:
            throw new error_1.FirebaseError("Unsupported content type: " + contentType);
    }
}
