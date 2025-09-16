"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertKeyTypes = exports.requireKeys = void 0;
const error_1 = require("../../../../error");
/**
 * Asserts that all yaml contains all required keys specified in the schema.
 */
function requireKeys(prefix, yaml, ...keys) {
    if (prefix) {
        prefix = prefix + ".";
    }
    for (const key of keys) {
        if (!yaml[key]) {
            throw new error_1.FirebaseError(`Expected key ${prefix + key.toString()}`);
        }
    }
}
exports.requireKeys = requireKeys;
/**
 * Asserts that runtime types of the given object matches the type specified in the schema.
 * If a passthrough function is provided, skips validation if the function returns true on
 * a given key-value pair, which is useful when dealing with known extra fields at runtime
 * from the wire format.
 */
function assertKeyTypes(prefix, yaml, schema) {
    if (!yaml) {
        return;
    }
    for (const [keyAsString, value] of Object.entries(yaml)) {
        // I don't know why Object.entries(foo)[0] isn't type of keyof foo...
        const key = keyAsString;
        const fullKey = prefix ? `${prefix}.${keyAsString}` : keyAsString;
        if (!schema[key] || schema[key] === "omit") {
            throw new error_1.FirebaseError(`Unexpected key '${fullKey}'. You may need to install a newer version of the Firebase CLI.`);
        }
        let schemaType = schema[key];
        if (typeof schemaType === "function") {
            if (!schemaType(value)) {
                const friendlyName = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
                throw new error_1.FirebaseError(`${friendlyName} ${fullKey} failed validation`);
            }
            continue;
        }
        if (value === null) {
            if (schemaType.endsWith("?")) {
                continue;
            }
            throw new error_1.FirebaseError(`Expected ${fullKey} to be type ${schemaType}; was null`);
        }
        if (schemaType.endsWith("?")) {
            schemaType = schemaType.slice(0, schemaType.length - 1);
        }
        if (schemaType.includes("Field")) {
            const match = /^Field<(\w+)>$/.exec(schemaType);
            if (match && typeof value !== "string" && typeof value !== match[1]) {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be Field<${match[1]}>; was ${typeof value}`);
            }
            continue;
        }
        if (schemaType === "List") {
            if (typeof value !== "string" && !Array.isArray(value)) {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be a field list (array or list expression); was ${typeof value}`);
            }
            continue;
        }
        if (value === null) {
            if (schemaType.endsWith("?")) {
                continue;
            }
            throw new error_1.FirebaseError(`Expected ${fullKey}} to be type ${schemaType}; was null`);
        }
        if (schemaType.endsWith("?")) {
            schemaType = schemaType.slice(0, schemaType.length - 1);
        }
        if (schemaType === "string") {
            if (typeof value !== "string") {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be type string; was ${typeof value}`);
            }
        }
        else if (schemaType === "number") {
            if (typeof value !== "number") {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be type number; was ${typeof value}`);
            }
        }
        else if (schemaType === "boolean") {
            if (typeof value !== "boolean") {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be type boolean; was ${typeof value}`);
            }
        }
        else if (schemaType === "array") {
            if (!Array.isArray(value)) {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be type array; was ${typeof value}`);
            }
        }
        else if (schemaType === "object") {
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                throw new error_1.FirebaseError(`Expected ${fullKey} to be type object; was ${typeof value}`);
            }
        }
        else {
            throw new error_1.FirebaseError("YAML validation is missing a handled type " + schema[key]);
        }
    }
}
exports.assertKeyTypes = assertKeyTypes;
