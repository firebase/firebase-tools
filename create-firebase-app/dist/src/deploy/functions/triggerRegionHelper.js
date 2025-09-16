"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureTriggerRegions = void 0;
const backend = require("./backend");
const services_1 = require("./services");
/**
 * Ensures the trigger regions are set and correct
 * @param want the list of function specs we want to deploy
 * @param have the list of function specs we have deployed
 */
async function ensureTriggerRegions(want) {
    const regionLookups = [];
    for (const ep of backend.allEndpoints(want)) {
        if (ep.platform === "gcfv1" || !backend.isEventTriggered(ep)) {
            continue;
        }
        regionLookups.push((0, services_1.serviceForEndpoint)(ep).ensureTriggerRegion(ep));
    }
    await Promise.all(regionLookups);
}
exports.ensureTriggerRegions = ensureTriggerRegions;
