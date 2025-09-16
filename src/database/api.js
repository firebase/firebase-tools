"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeOriginOrCustomUrl = exports.realtimeOriginOrEmulatorOrCustomUrl = void 0;
const utils_1 = require("../utils");
const constants_1 = require("../emulator/constants");
/**
 * Get base URL for RealtimeDatabase. Preference order: emulator host env override, realtime URL env override, and then specified host.
 * @param options command options.
 */
function realtimeOriginOrEmulatorOrCustomUrl(host) {
    return (0, utils_1.envOverride)(constants_1.Constants.FIREBASE_DATABASE_EMULATOR_HOST, (0, utils_1.envOverride)("FIREBASE_REALTIME_URL", host), addHttpIfRequired);
}
exports.realtimeOriginOrEmulatorOrCustomUrl = realtimeOriginOrEmulatorOrCustomUrl;
/**
 * Get base URL for RealtimeDatabase. Preference order: realtime URL env override, and then the specified host.
 * @param options command options.
 */
function realtimeOriginOrCustomUrl(host) {
    return (0, utils_1.envOverride)("FIREBASE_REALTIME_URL", host);
}
exports.realtimeOriginOrCustomUrl = realtimeOriginOrCustomUrl;
function addHttpIfRequired(val) {
    if (val.startsWith("http")) {
        return val;
    }
    return `http://${val}`;
}
//# sourceMappingURL=api.js.map