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
exports.ensureTriggerRegions = void 0;
const backend = __importStar(require("./backend"));
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
//# sourceMappingURL=triggerRegionHelper.js.map