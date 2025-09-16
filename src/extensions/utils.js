"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResourceRuntime = exports.formatTimestamp = exports.getRandomString = exports.convertExtensionOptionToLabeledList = void 0;
const types_1 = require("./types");
/**
 * Convert extension option to Inquirer-friendly list for the prompt, with all items unchecked.
 */
function convertExtensionOptionToLabeledList(options) {
    return options.map((option) => {
        return {
            checked: false,
            name: option.label,
            value: option.value,
        };
    });
}
exports.convertExtensionOptionToLabeledList = convertExtensionOptionToLabeledList;
/**
 * Generates a random string of lowercase letters and numbers
 * @param length The length of the string
 */
function getRandomString(length) {
    const SUFFIX_CHAR_SET = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += SUFFIX_CHAR_SET.charAt(Math.floor(Math.random() * SUFFIX_CHAR_SET.length));
    }
    return result;
}
exports.getRandomString = getRandomString;
/**
 * Formats a timestamp from the Extension backend into something more readable
 * @param timestamp with this format: 2020-05-11T03:45:13.583677Z
 * @return a timestamp with this format: 2020-05-11 T03:45:13
 */
function formatTimestamp(timestamp) {
    if (!timestamp) {
        return "";
    }
    const withoutMs = timestamp.split(".")[0];
    return withoutMs.replace("T", " ");
}
exports.formatTimestamp = formatTimestamp;
/**
 * Returns the runtime for the resource. The resource may be v1 or v2 function,
 * etc, and this utility will do its best to identify the runtime specified for
 * this resource.
 */
function getResourceRuntime(resource) {
    switch (resource.type) {
        case types_1.FUNCTIONS_RESOURCE_TYPE:
            return resource.properties?.runtime;
        case types_1.FUNCTIONS_V2_RESOURCE_TYPE:
            return resource.properties?.buildConfig?.runtime;
        default:
            return undefined;
    }
}
exports.getResourceRuntime = getResourceRuntime;
//# sourceMappingURL=utils.js.map