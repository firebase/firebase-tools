"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeRFC5987 = void 0;
/**
 * Adapted from:
 *  - https://datatracker.ietf.org/doc/html/rfc5987
 *  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent#examples
 *
 * @returns RFC5987 encoded string
 */
function encodeRFC5987(str) {
    return encodeURIComponent(str)
        .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%(7C|60|5E)/g, (str, hex) => String.fromCharCode(parseInt(hex, 16)));
}
exports.encodeRFC5987 = encodeRFC5987;
//# sourceMappingURL=rfc.js.map