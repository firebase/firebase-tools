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
exports.equal = exports.toExtensionVersionName = exports.toExtensionName = exports.toExtensionVersionRef = exports.toExtensionRef = exports.parse = void 0;
const semver = __importStar(require("semver"));
const error_1 = require("../error");
const refRegex = new RegExp(/^([^/@\n]+)\/{1}([^/@\n]+)(@{1}([^\n]+)|)$/);
/**
 * Parse a extension ref or name into a Ref
 * @param refOrName an extension or extension version
 *                  ref (publisher/extension@version)
 *                   or fully qualified name
 */
function parse(refOrName) {
    const ret = parseRef(refOrName) || parseName(refOrName);
    if (!ret || !ret.publisherId || !ret.extensionId) {
        throw new error_1.FirebaseError(`Unable to parse ${refOrName} as an extension ref.\n` +
            "Expected format is either publisherId/extensionId@version or " +
            "publishers/publisherId/extensions/extensionId/versions/version. If you " +
            "are referring to a local extension directory, please ensure the directory exists.");
    }
    if (ret.version &&
        !semver.valid(ret.version) &&
        !semver.validRange(ret.version) &&
        !["latest", "latest-approved"].includes(ret.version)) {
        throw new error_1.FirebaseError(`Extension reference ${JSON.stringify(ret, null, 2)} contains an invalid version ${ret.version}.`);
    }
    return ret;
}
exports.parse = parse;
function parseRef(ref) {
    const parts = refRegex.exec(ref);
    // Exec additionally returns original string, index, & input values.
    if (parts && (parts.length === 5 || parts.length === 7)) {
        return {
            publisherId: parts[1],
            extensionId: parts[2],
            version: parts[4],
        };
    }
}
function parseName(name) {
    const parts = name.split("/");
    if (parts[0] !== "publishers" || parts[2] !== "extensions") {
        return;
    }
    if (parts.length === 4) {
        return {
            publisherId: parts[1],
            extensionId: parts[3],
        };
    }
    if (parts.length === 6 && parts[4] === "versions") {
        return {
            publisherId: parts[1],
            extensionId: parts[3],
            version: parts[5],
        };
    }
}
/**
 * To an extension ref: publisherId/extensionId
 */
function toExtensionRef(ref) {
    return `${ref.publisherId}/${ref.extensionId}`;
}
exports.toExtensionRef = toExtensionRef;
/**
 * To an extension version ref: publisherId/extensionId@version
 */
function toExtensionVersionRef(ref) {
    if (!ref.version) {
        throw new error_1.FirebaseError(`Ref does not have a version`);
    }
    return `${ref.publisherId}/${ref.extensionId}@${ref.version}`;
}
exports.toExtensionVersionRef = toExtensionVersionRef;
/**
 * To a fully qualified extension name : publishers/publisherId/extensions/extensionId
 */
function toExtensionName(ref) {
    return `publishers/${ref.publisherId}/extensions/${ref.extensionId}`;
}
exports.toExtensionName = toExtensionName;
/**
 * To a fully qualified extension version name : publishers/publisherId/extensions/extensionId/version/versionId
 */
function toExtensionVersionName(ref) {
    if (!ref.version) {
        throw new error_1.FirebaseError(`Ref does not have a version`);
    }
    return `publishers/${ref.publisherId}/extensions/${ref.extensionId}/versions/${ref.version}`;
}
exports.toExtensionVersionName = toExtensionVersionName;
/**
 * Checks if two refs refer to the same extensionVersion.
 */
function equal(a, b) {
    return (!!a &&
        !!b &&
        a.publisherId === b.publisherId &&
        a.extensionId === b.extensionId &&
        a.version === b.version);
}
exports.equal = equal;
//# sourceMappingURL=refs.js.map