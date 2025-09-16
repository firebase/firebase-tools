"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorMessage = exports.getValidator = void 0;
const fs = require("fs");
const path = require("path");
const ajv_1 = require("ajv");
const ajv_formats_1 = require("ajv-formats");
// We need to allow union types becuase typescript-json-schema generates them sometimes.
const ajv = new ajv_1.Ajv({ allowUnionTypes: true });
(0, ajv_formats_1.default)(ajv);
let _VALIDATOR = undefined;
/**
 * Lazily load the 'schema/firebase-config.json' file and return an AJV validation
 * function. By doing this lazily we don't impose this I/O cost on those using
 * the CLI as a Node module.
 */
function getValidator() {
    if (!_VALIDATOR) {
        const schemaStr = fs.readFileSync(path.resolve(__dirname, "../schema/firebase-config.json"), "utf-8");
        const schema = JSON.parse(schemaStr);
        _VALIDATOR = ajv.compile(schema);
    }
    return _VALIDATOR;
}
exports.getValidator = getValidator;
function getErrorMessage(e) {
    if (e.keyword === "additionalProperties") {
        return `Object "${e.instancePath}" in "firebase.json" has unknown property: ${JSON.stringify(e.params)}`;
    }
    else if (e.keyword === "required") {
        return `Object "${e.instancePath}" in "firebase.json" is missing required property: ${JSON.stringify(e.params)}`;
    }
    else {
        return `Field "${e.instancePath}" in "firebase.json" is possibly invalid: ${e.message}`;
    }
}
exports.getErrorMessage = getErrorMessage;
