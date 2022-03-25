import * as _ from "lodash";
import { onceWithJoin } from "./utils";
import { promptOnce } from "../prompt";
import { EventDescriptor } from "./extensionsApi";

export interface EventArcConfig {
    location: string;
    channel?: string;
}

export function checkSelectedEventsResponse(response: string, validEventTypes: EventDescriptor[]): boolean {
    let valid = true;
    let responses = response.split(","); // multiselect
    // @todo: check responses and validate against events
    return valid;
}

export async function askForSelectedEvents(eventDescriptors: EventDescriptor[]): Promise<string[]> {
    let valid = false;
    let response = "";
    let eventTypes = _.map(eventDescriptors, e => ({checked: false, value: e.type}))
    while (!valid) {
        response = await onceWithJoin({
            name: "selectedEventTypesInput",
            type: "checkbox",
            default: [],
            message:
              "The publisher has configured this extension to emit custom events. " +
              "You can implement your own handlers that trigger when these events are emitted to customize the extension's behavior. " +
              "Please select the events that this extension is permitted to emit. ",
            choices: eventTypes,
          });
          valid = checkSelectedEventsResponse(response, eventDescriptors);
    }
    if (response === "") {
        return [];
    }
    return response.split(",");
}

export async function askForEventArcConfig(): Promise<EventArcConfig> {

    // Step 1: Ask user for channel ID
    // This should be a string input with a regex - maybe requiring alphanumeric, period, hyphen, underscore, slashes, n characters?
    // What is the channel ID validation that event arc requires?
    let valid = false;
    let channel = "";
    while (!valid) {
        channel = await promptOnce({
            name: "channelIdInput",
            type: "input",
            default: "firebase",
            message: `These events are emitted through Eventarc as custom cloud events. What Eventarc channel would you like these events to be emitted to? `,
        });
        valid = channel !== "";
    }

    // Step 2: Ask user for location (default to us-central1)
    // This should be a select prompt
    valid = false;
    let allowedRegions = ["us-central1", "us-west2", "us-west3", "us-west4"];
    let location = "";
    while (!valid) {
        location = await promptOnce({
            name: "input",
            type: "list",
            default: "us-central1",
            message:
              "Which region would you like the Eventarc channel to live in?",
            choices: _.map(allowedRegions, e => ({checked: false, value: e}))
        });
        valid = allowedRegions.includes(location);
    }
    return {location: location, channel: channel};
  }
