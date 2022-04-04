import * as _ from "lodash";
import { onceWithJoin } from "./utils";
import { promptOnce } from "../prompt";
import { EventDescriptor } from "./extensionsApi";
import * as utils from "../utils";

export function checkAllowedEventTypesResponse(
  response: string,
  validEvents: EventDescriptor[]
): boolean {
  const valid = true;
  const responses = response.split(","); // multiselect
  const validEventTypes = validEvents.map((e) => e.type);
  for (const response of responses) {
    if (!validEventTypes.includes(response)) {
      utils.logWarning(
        `Unexpected event type '${response}' was marked as allowed to be emitted. This event type is not part of the extension spec.`
      );
      return false;
    }
  }
  return valid;
}

export async function askForAllowedEventTypes(
  eventDescriptors: EventDescriptor[]
): Promise<string[]> {
  let valid = false;
  let response = "";
  const eventTypes = _.map(eventDescriptors, (e) => ({ checked: false, value: e.type }));
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
    valid = checkAllowedEventTypesResponse(response, eventDescriptors);
  }
  return response.split(",").filter((e) => e !== "");
}

export async function askForEventArcLocation(): Promise<string> {
  let valid = false;
  const allowedRegions = ["us-central1", "us-west1", "europe-west4", "asia-northeast1"];
  let location = "";
  while (!valid) {
    location = await promptOnce({
      name: "input",
      type: "list",
      default: "us-central1",
      message: "Which region would you like the Eventarc channel to live in?",
      choices: _.map(allowedRegions, (e) => ({ checked: false, value: e })),
    });
    valid = allowedRegions.includes(location);
    if (!valid) {
      utils.logWarning(
        `Unexpected EventArc region '${location}' was specified. Allowed regions: ${allowedRegions.join(
          ", "
        )}`
      );
    }
  }
  return location;
}
