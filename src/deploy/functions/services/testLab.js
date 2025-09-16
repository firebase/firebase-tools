"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureTestLabTriggerRegion = void 0;
const error_1 = require("../../../error");
/**
 * Sets a Test Lab event trigger's region to 'global' since the service is global
 * @param endpoint the test lab endpoint
 */
function ensureTestLabTriggerRegion(endpoint) {
    if (!endpoint.eventTrigger.region) {
        endpoint.eventTrigger.region = "global";
    }
    if (endpoint.eventTrigger.region !== "global") {
        throw new error_1.FirebaseError("A Test Lab trigger must specify 'global' trigger location");
    }
    return Promise.resolve();
}
exports.ensureTestLabTriggerRegion = ensureTestLabTriggerRegion;
//# sourceMappingURL=testLab.js.map