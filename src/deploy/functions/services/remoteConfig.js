"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRemoteConfigTriggerRegion = void 0;
const error_1 = require("../../../error");
/**
 * Sets a Remote Config event trigger's region to 'global' since the service is global
 * @param endpoint the remote config endpoint
 */
function ensureRemoteConfigTriggerRegion(endpoint) {
    if (!endpoint.eventTrigger.region) {
        endpoint.eventTrigger.region = "global";
    }
    if (endpoint.eventTrigger.region !== "global") {
        throw new error_1.FirebaseError("A remote config trigger must specify 'global' trigger location");
    }
    return Promise.resolve();
}
exports.ensureRemoteConfigTriggerRegion = ensureRemoteConfigTriggerRegion;
//# sourceMappingURL=remoteConfig.js.map