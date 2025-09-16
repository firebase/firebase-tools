"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertType = exports.assertEnum = exports.assertHasOneOf = exports.assertHas = void 0;
const clc = require("colorette");
const error_1 = require("../error");
/**
 * Throw an error if 'obj' does not have a value for the property 'prop'.
 */
function assertHas(obj, prop) {
    const objString = clc.cyan(JSON.stringify(obj));
    if (!obj[prop]) {
        throw new error_1.FirebaseError(`Must contain "${prop}": ${objString}`);
    }
}
exports.assertHas = assertHas;
/**
 * throw an error if 'obj' does not have a value for exactly one of the
 * properties in 'props'.
 */
function assertHasOneOf(obj, props) {
    const objString = clc.cyan(JSON.stringify(obj));
    let count = 0;
    props.forEach((prop) => {
        if (obj[prop]) {
            count++;
        }
    });
    if (count !== 1) {
        throw new error_1.FirebaseError(`Must contain exactly one of "${props.join(",")}": ${objString}`);
    }
}
exports.assertHasOneOf = assertHasOneOf;
/**
 * Throw an error if the value of the property 'prop' on 'obj' is not one of
 * the values in the the array 'valid'.
 */
function assertEnum(obj, prop, valid) {
    const objString = clc.cyan(JSON.stringify(obj));
    if (valid.indexOf(obj[prop]) < 0) {
        throw new error_1.FirebaseError(`Field "${prop}" must be one of ${valid.join(", ")}: ${objString}`);
    }
}
exports.assertEnum = assertEnum;
/**
 * Throw an error if the value of the property 'prop' differs against type
 * guard.
 */
function assertType(prop, propValue, type) {
    if (typeof propValue !== type) {
        throw new error_1.FirebaseError(`Property "${prop}" must be of type ${type}`);
    }
}
exports.assertType = assertType;
