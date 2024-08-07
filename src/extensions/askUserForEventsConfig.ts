import { promptOnce } from "../prompt";
import * as extensionsApi from "../extensions/extensionsApi";
import { EventDescriptor, ExtensionInstance } from "./types";
import * as utils from "../utils";
import * as clc from "colorette";
import { logger } from "../logger";
import { marked } from "marked";

export interface InstanceEventsConfig {
  channel: string;
  allowedEventTypes: string[];
}

/**
 * Validates the user's selected events against the list of valid events
 * @param response The user's selected events
 * @param validEvents The list of valid events
 * @return True if the response is valid
 */
export function checkAllowedEventTypesResponse(
  response: string[],
  validEvents: EventDescriptor[],
): boolean {
  const validEventTypes = validEvents.map((e) => e.type);
  if (response.length === 0) {
    return false;
  }
  for (const e of response) {
    if (!validEventTypes.includes(e)) {
      utils.logWarning(
        `Unexpected event type '${e}' was configured to be emitted. This event type is not part of the extension spec.`,
      );
      return false;
    }
  }
  return true;
}

/**
 * Asks the user if events should be enabled, and if yes, for the EventArc
 * channel and also the events to enable
 * @param events The list of possible events
 * @param projectId The projectId for the EventArc channel
 * @param instanceId The instanceId to get predefined events and location from
 * @return The instance events config or undefined if the user doesn't want events
 */
export async function askForEventsConfig(
  events: EventDescriptor[],
  projectId: string,
  instanceId: string,
): Promise<InstanceEventsConfig | undefined> {
  logger.info(
    `\n${clc.bold("Enable Events")}: ${await marked(
      "If you enable events, you can write custom event handlers ([https://firebase.google.com/docs/extensions/install-extensions#eventarc](https://firebase.google.com/docs/extensions/install-extensions#eventarc)) that respond to these events.\n\nYou can always enable or disable events later. Events will be emitted via Eventarc. Fees apply ([https://cloud.google.com/eventarc/pricing](https://cloud.google.com/eventarc/pricing)).",
    )}`,
  );
  if (!(await askShouldCollectEventsConfig())) {
    return undefined;
  }
  let existingInstance: ExtensionInstance | undefined;
  try {
    existingInstance = instanceId
      ? await extensionsApi.getInstance(projectId, instanceId)
      : undefined;
  } catch {
    /* If instance was not found, then this is an instance ID for a new instance. Don't preselect any values when displaying prompts to the user. */
  }
  const preselectedTypes = existingInstance?.config.allowedEventTypes ?? [];
  const oldLocation = existingInstance?.config.eventarcChannel?.split("/")[3];
  const location = await askForEventArcLocation(oldLocation);
  const channel = getEventArcChannel(projectId, location);
  const allowedEventTypes = await askForAllowedEventTypes(events, preselectedTypes);
  return { channel, allowedEventTypes };
}

/**
 * Creates an EventArc channel resource name
 * @param projectId The projectId for the channel
 * @param location The location for the channel
 * @return The resource name for the EventArc channel
 */
export function getEventArcChannel(projectId: string, location: string): string {
  return `projects/${projectId}/locations/${location}/channels/firebase`;
}

/**
 * Asks the user which event types they would like to enable
 * @param eventDescriptors The list of possible events
 * @param preselectedTypes The list of preselected events
 * @return A list of strings indicating the event types
 */
export async function askForAllowedEventTypes(
  eventDescriptors: EventDescriptor[],
  preselectedTypes?: string[],
): Promise<string[]> {
  let valid = false;
  let response: string[] = [];
  const eventTypes = eventDescriptors.map((e, index) => ({
    checked: false,
    name: `${index + 1}. ${e.type}\n   ${e.description}`,
    value: e.type,
  }));
  while (!valid) {
    response = await promptOnce({
      name: "selectedEventTypesInput",
      type: "checkbox",
      default: preselectedTypes ?? [],
      message:
        `Please select the events [${eventTypes.length} types total] that this extension is permitted to emit. ` +
        "You can implement your own handlers that trigger when these events are emitted to customize the extension's behavior. ",
      choices: eventTypes,
      pageSize: 20,
    });
    valid = checkAllowedEventTypesResponse(response, eventDescriptors);
  }
  return response.filter((e) => e !== "");
}

/**
 * Asks the user if they want to enable events
 * @return A boolean indicating if they want to enable events
 */
export async function askShouldCollectEventsConfig(): Promise<boolean> {
  return promptOnce({
    type: "confirm",
    name: "shouldCollectEvents",
    message: `Would you like to enable events?`,
    default: false,
  });
}

export const ALLOWED_EVENT_ARC_REGIONS = [
  "us-central1",
  "us-west1",
  "europe-west4",
  "asia-northeast1",
];
export type ExtensionsEventArcRegions = (typeof ALLOWED_EVENT_ARC_REGIONS)[number];
export const EXTENSIONS_DEFAULT_EVENT_ARC_REGION: ExtensionsEventArcRegions = "us-central1";

/**
 * Asks the user to select an EventArc location
 * @param preselectedLocation (Optional) A preselected option
 * @return A string representing the EventArc location.
 */
export async function askForEventArcLocation(preselectedLocation?: string): Promise<string> {
  let valid = false;
  let location = "";
  while (!valid) {
    location = await promptOnce({
      name: "input",
      type: "list",
      default: preselectedLocation ?? EXTENSIONS_DEFAULT_EVENT_ARC_REGION,
      message:
        "Which location would you like the Eventarc channel to live in? We recommend using the default option. A channel location that differs from the extension's Cloud Functions location can incur egress cost.",
      choices: ALLOWED_EVENT_ARC_REGIONS.map((e) => ({ checked: false, value: e })),
    });
    valid = ALLOWED_EVENT_ARC_REGIONS.includes(location);
    if (!valid) {
      utils.logWarning(
        `Unexpected EventArc region '${location}' was specified. Allowed regions: ${ALLOWED_EVENT_ARC_REGIONS.join(
          ", ",
        )}`,
      );
    }
  }
  return location;
}
