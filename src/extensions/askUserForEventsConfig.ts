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

export async function askForEventsConfig(
  events: EventDescriptor[],
  projectId: string,
  instanceId: string,
): Promise<InstanceEventsConfig | undefined> {
  logger.info(
    `\n${clc.bold("Enable Events")}: ${marked(
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
  const channel = `projects/${projectId}/locations/${location}/channels/firebase`;
  const allowedEventTypes = await askForAllowedEventTypes(events, preselectedTypes);
  return { channel, allowedEventTypes };
}

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

export async function askShouldCollectEventsConfig(): Promise<boolean> {
  return promptOnce({
    type: "confirm",
    name: "shouldCollectEvents",
    message: `Would you like to enable events?`,
    default: false,
  });
}

export async function askForEventArcLocation(preselectedLocation?: string): Promise<string> {
  let valid = false;
  const allowedRegions = ["us-central1", "us-west1", "europe-west4", "asia-northeast1"];
  let location = "";
  while (!valid) {
    location = await promptOnce({
      name: "input",
      type: "list",
      default: preselectedLocation ?? "us-central1",
      message:
        "Which location would you like the Eventarc channel to live in? We recommend using the default option. A channel location that differs from the extension's Cloud Functions location can incur egress cost.",
      choices: allowedRegions.map((e) => ({ checked: false, value: e })),
    });
    valid = allowedRegions.includes(location);
    if (!valid) {
      utils.logWarning(
        `Unexpected EventArc region '${location}' was specified. Allowed regions: ${allowedRegions.join(
          ", ",
        )}`,
      );
    }
  }
  return location;
}
