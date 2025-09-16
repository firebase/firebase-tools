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
exports.askForEventArcLocation = exports.EXTENSIONS_DEFAULT_EVENT_ARC_REGION = exports.ALLOWED_EVENT_ARC_REGIONS = exports.askShouldCollectEventsConfig = exports.askForAllowedEventTypes = exports.getEventArcChannel = exports.askForEventsConfig = exports.checkAllowedEventTypesResponse = void 0;
const extensionsApi = __importStar(require("../extensions/extensionsApi"));
const utils = __importStar(require("../utils"));
const clc = __importStar(require("colorette"));
const logger_1 = require("../logger");
const marked_1 = require("marked");
const prompt_1 = require("../prompt");
/**
 * Validates the user's selected events against the list of valid events
 * @param response The user's selected events
 * @param validEvents The list of valid events
 * @return True if the response is valid
 */
function checkAllowedEventTypesResponse(response, validEvents) {
    const validEventTypes = validEvents.map((e) => e.type);
    if (response.length === 0) {
        return false;
    }
    for (const e of response) {
        if (!validEventTypes.includes(e)) {
            utils.logWarning(`Unexpected event type '${e}' was configured to be emitted. This event type is not part of the extension spec.`);
            return false;
        }
    }
    return true;
}
exports.checkAllowedEventTypesResponse = checkAllowedEventTypesResponse;
/**
 * Asks the user if events should be enabled, and if yes, for the EventArc
 * channel and also the events to enable
 * @param events The list of possible events
 * @param projectId The projectId for the EventArc channel
 * @param instanceId The instanceId to get predefined events and location from
 * @return The instance events config or undefined if the user doesn't want events
 */
async function askForEventsConfig(events, projectId, instanceId) {
    logger_1.logger.info(`\n${clc.bold("Enable Events")}: ${await (0, marked_1.marked)("If you enable events, you can write custom event handlers ([https://firebase.google.com/docs/extensions/install-extensions#eventarc](https://firebase.google.com/docs/extensions/install-extensions#eventarc)) that respond to these events.\n\nYou can always enable or disable events later. Events will be emitted via Eventarc. Fees apply ([https://cloud.google.com/eventarc/pricing](https://cloud.google.com/eventarc/pricing)).")}`);
    if (!(await askShouldCollectEventsConfig())) {
        return undefined;
    }
    let existingInstance;
    try {
        existingInstance = instanceId
            ? await extensionsApi.getInstance(projectId, instanceId)
            : undefined;
    }
    catch {
        /* If instance was not found, then this is an instance ID for a new instance. Don't preselect any values when displaying prompts to the user. */
    }
    const preselectedTypes = existingInstance?.config.allowedEventTypes ?? [];
    const oldLocation = existingInstance?.config.eventarcChannel?.split("/")[3];
    const location = await askForEventArcLocation(oldLocation);
    const channel = getEventArcChannel(projectId, location);
    const allowedEventTypes = await askForAllowedEventTypes(events, preselectedTypes);
    return { channel, allowedEventTypes };
}
exports.askForEventsConfig = askForEventsConfig;
/**
 * Creates an EventArc channel resource name
 * @param projectId The projectId for the channel
 * @param location The location for the channel
 * @return The resource name for the EventArc channel
 */
function getEventArcChannel(projectId, location) {
    return `projects/${projectId}/locations/${location}/channels/firebase`;
}
exports.getEventArcChannel = getEventArcChannel;
/**
 * Asks the user which event types they would like to enable
 * @param eventDescriptors The list of possible events
 * @param preselectedTypes The list of preselected events
 * @return A list of strings indicating the event types
 */
async function askForAllowedEventTypes(eventDescriptors, preselectedTypes) {
    let valid = false;
    let response = [];
    const eventTypes = eventDescriptors.map((e, index) => ({
        checked: false,
        name: `${index + 1}. ${e.type}\n   ${e.description}`,
        value: e.type,
    }));
    while (!valid) {
        response = await (0, prompt_1.checkbox)({
            default: preselectedTypes ?? [],
            message: `Please select the events [${eventTypes.length} types total] that this extension is permitted to emit. ` +
                "You can implement your own handlers that trigger when these events are emitted to customize the extension's behavior. ",
            choices: eventTypes,
            pageSize: 20,
        });
        valid = checkAllowedEventTypesResponse(response, eventDescriptors);
    }
    return response.filter((e) => e !== "");
}
exports.askForAllowedEventTypes = askForAllowedEventTypes;
/**
 * Asks the user if they want to enable events
 * @return A boolean indicating if they want to enable events
 */
function askShouldCollectEventsConfig() {
    return (0, prompt_1.confirm)("Would you like to enable events?");
}
exports.askShouldCollectEventsConfig = askShouldCollectEventsConfig;
exports.ALLOWED_EVENT_ARC_REGIONS = [
    "us-central1",
    "us-west1",
    "europe-west4",
    "asia-northeast1",
];
exports.EXTENSIONS_DEFAULT_EVENT_ARC_REGION = "us-central1";
/**
 * Asks the user to select an EventArc location
 * @param preselectedLocation (Optional) A preselected option
 * @return A string representing the EventArc location.
 */
async function askForEventArcLocation(preselectedLocation) {
    let valid = false;
    let location = "";
    while (!valid) {
        location = await (0, prompt_1.select)({
            default: preselectedLocation ?? exports.EXTENSIONS_DEFAULT_EVENT_ARC_REGION,
            message: "Which location would you like the Eventarc channel to live in? We recommend using the default option. A channel location that differs from the extension's Cloud Functions location can incur egress cost.",
            choices: exports.ALLOWED_EVENT_ARC_REGIONS,
        });
        valid = exports.ALLOWED_EVENT_ARC_REGIONS.includes(location);
        if (!valid) {
            utils.logWarning(`Unexpected EventArc region '${location}' was specified. Allowed regions: ${exports.ALLOWED_EVENT_ARC_REGIONS.join(", ")}`);
        }
    }
    return location;
}
exports.askForEventArcLocation = askForEventArcLocation;
//# sourceMappingURL=askUserForEventsConfig.js.map