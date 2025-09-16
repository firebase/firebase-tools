"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.search = exports.password = exports.number = exports.select = exports.checkbox = exports.confirm = exports.input = exports.guard = exports.Separator = void 0;
const inquirer = require("@inquirer/prompts");
const error_1 = require("./error");
var prompts_1 = require("@inquirer/prompts");
Object.defineProperty(exports, "Separator", { enumerable: true, get: function () { return prompts_1.Separator; } });
/**
 * Guard function to check if the prompt should return a default value or throw an error.
 * This is used to prevent prompts from being shown in non-interactive mode.
 *
 * @param opts - The options for the prompt.
 * @returns An object indicating whether to return a value or not.
 */
function guard(opts) {
    if (!opts.nonInteractive) {
        return { shouldReturn: false, value: undefined };
    }
    if (typeof opts.default !== "undefined") {
        return { shouldReturn: true, value: opts.default };
    }
    throw new error_1.FirebaseError(`Question "${opts.message}" does not have a default and cannot be answered in non-interactive mode`);
}
exports.guard = guard;
async function input(opts) {
    if (typeof opts === "string") {
        opts = { message: opts };
    }
    else {
        const { shouldReturn, value } = guard(opts);
        if (shouldReturn) {
            return value;
        }
    }
    return inquirer.input(opts);
}
exports.input = input;
async function confirm(opts) {
    if (typeof opts === "string") {
        opts = { message: opts };
    }
    else {
        if (opts.force) {
            // TODO: Should we print what we've forced?
            return true;
        }
        const { shouldReturn, value } = guard(opts);
        if (shouldReturn) {
            return value;
        }
    }
    return inquirer.confirm(opts);
}
exports.confirm = confirm;
/**
 * Prompt a user for one or more of many options.
 * Can accept a generic type for enum values.
 */
async function checkbox(opts) {
    const { shouldReturn, value } = guard(opts);
    if (shouldReturn) {
        return value;
    }
    return inquirer.checkbox(Object.assign(Object.assign({}, opts), { loop: true }));
}
exports.checkbox = checkbox;
/**
 * Prompt a user to make a choice amongst a list.
 */
async function select(opts) {
    const { shouldReturn, value } = guard(opts);
    if (shouldReturn) {
        return value;
    }
    return inquirer.select(Object.assign(Object.assign({}, opts), { loop: false }));
}
exports.select = select;
async function number(opts) {
    if (typeof opts === "string") {
        opts = { message: opts };
    }
    else {
        const { shouldReturn, value } = guard(opts);
        if (shouldReturn) {
            return value;
        }
    }
    return await inquirer.number(Object.assign({ required: true }, opts));
}
exports.number = number;
async function password(opts) {
    if (typeof opts === "string") {
        opts = { message: opts };
    }
    else {
        // Note, without default can basically only throw
        guard(opts);
    }
    return inquirer.password(Object.assign(Object.assign({}, opts), { mask: "" }));
}
exports.password = password;
/** Search for a value given a sorce callback. */
async function search(opts) {
    const { shouldReturn, value } = guard(opts);
    if (shouldReturn) {
        return value;
    }
    return inquirer.search(opts);
}
exports.search = search;
