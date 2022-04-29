import * as _ from "lodash";
import { promptOnce } from "../prompt";
import * as extensionsApi from "../extensions/extensionsApi";
import * as utils from "../utils";

export interface InstanceEventsConfig {
  channel: string;
  allowedEventTypes: string[];
}

export function checkAllowedEventTypesResponse(
  response: string[],
  validEvents: extensionsApi.EventDescriptor[]
): boolean {
  const valid = true;
  const validEventTypes = validEvents.map((e) => e.type);
  for (const e of response) {
    if (!validEventTypes.includes(e)) {
      utils.logWarning(
        `Unexpected event type '${e}' was configured to be emitted. This event type is not part of the extension spec.`
      );
      return false;
    }
  }
  return valid;
}

export async function askForEventsConfig(
  events: extensionsApi.EventDescriptor[],
  projectId: string,
  instanceId: string
): Promise<InstanceEventsConfig | undefined> {
  if (!(await askShouldCollectEventsConfig())) {
    return undefined;
  }
  let existingInstance: extensionsApi.ExtensionInstance | undefined;
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
  eventDescriptors: extensionsApi.EventDescriptor[],
  preselectedTypes?: string[]
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
      // @TODO(b/229170748): Link to docs / audit the copy with UX.
      message:
        `Please select the events [${eventTypes.length} total] that this extension is permitted to emit. ` +
        `You can implement your own handlers that trigger when these events are emitted to customize the extension's behavior. `,
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
    // @TODO(b/229170748): Link to docs / audit the copy with UX.
    message: `Would you like to enable events? If you enable events, this extension will publish events to Eventarc at key points in its lifecycle. Eventarc usage fees apply. You can write custom event handlers that respond to these events. You can always enable events later.`,
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
          ", "
        )}`
      );
    }
  }
  return location;
}
