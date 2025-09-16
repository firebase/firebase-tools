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
exports.search = exports.password = exports.number = exports.select = exports.checkbox = exports.confirm = exports.input = exports.guard = exports.Separator = void 0;
const inquirer = __importStar(require("@inquirer/prompts"));
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
    return inquirer.checkbox({
        ...opts,
        loop: true,
    });
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
    return inquirer.select({
        ...opts,
        loop: false,
    });
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
    return await inquirer.number({ required: true, ...opts });
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
    return inquirer.password({
        ...opts,
        mask: "",
    });
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
//# sourceMappingURL=prompt.js.map