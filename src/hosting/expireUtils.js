"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateChannelExpireTTL = exports.DEFAULT_DURATION = exports.MAX_DURATION = exports.Duration = exports.DURATION_REGEX = void 0;
const error_1 = require("../error");
/**
 * A regex to test for valid duration strings.
 */
exports.DURATION_REGEX = /^(\d+)([hdm])$/;
/**
 * Basic durations in milliseconds.
 */
var Duration;
(function (Duration) {
    Duration[Duration["MINUTE"] = 60000] = "MINUTE";
    Duration[Duration["HOUR"] = 3600000] = "HOUR";
    Duration[Duration["DAY"] = 86400000] = "DAY";
})(Duration = exports.Duration || (exports.Duration = {}));
const DURATIONS = {
    m: Duration.MINUTE,
    h: Duration.HOUR,
    d: Duration.DAY,
};
/**
 * The maximum TTL duration for a channel: 30 days (represented in milliseconds).
 */
exports.MAX_DURATION = 30 * Duration.DAY;
/**
 * The default TTL duration for a channel: 7 days (represented in milliseconds).
 */
exports.DEFAULT_DURATION = 7 * Duration.DAY;
/**
 * calculateChannelExpireTTL returns the ms duration from the provided flag.
 * This will throw an error if the duration is greater than 30d.
 * @param flag string duration (e.g. "1d").
 * @return a duration in milliseconds.
 */
function calculateChannelExpireTTL(flag) {
    const match = exports.DURATION_REGEX.exec(flag);
    if (!match) {
        throw new error_1.FirebaseError(`"expires" flag must be a duration string (e.g. 24h or 7d) at most 30d`);
    }
    const d = parseInt(match[1], 10) * DURATIONS[match[2]];
    if (isNaN(d)) {
        throw new error_1.FirebaseError(`Failed to parse provided expire time "${flag}"`);
    }
    if (d > exports.MAX_DURATION) {
        throw new error_1.FirebaseError(`"expires" flag may not be longer than 30d`);
    }
    return d;
}
exports.calculateChannelExpireTTL = calculateChannelExpireTTL;
//# sourceMappingURL=expireUtils.js.map