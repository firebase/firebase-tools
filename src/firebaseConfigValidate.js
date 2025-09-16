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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorMessage = exports.getValidator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ajv_1 = require("ajv");
const ajv_formats_1 = __importDefault(require("ajv-formats"));
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
//# sourceMappingURL=firebaseConfigValidate.js.map