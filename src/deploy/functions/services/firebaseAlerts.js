"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureFirebaseAlertsTriggerRegion = void 0;
const error_1 = require("../../../error");
/**
 * Sets a Firebase Alerts event trigger's region to 'global' since the service is global
 * @param endpoint the storage endpoint
 * @param eventTrigger the endpoints event trigger
 */
function ensureFirebaseAlertsTriggerRegion(endpoint) {
    if (!endpoint.eventTrigger.region) {
        endpoint.eventTrigger.region = "global";
    }
    if (endpoint.eventTrigger.region !== "global") {
        throw new error_1.FirebaseError("A firebase alerts trigger must specify 'global' trigger location");
    }
    return Promise.resolve();
}
exports.ensureFirebaseAlertsTriggerRegion = ensureFirebaseAlertsTriggerRegion;
//# sourceMappingURL=firebaseAlerts.js.map