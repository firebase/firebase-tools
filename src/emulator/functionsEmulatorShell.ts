import * as uuid from "uuid";

import * as utils from "../utils";
import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition } from "./functionsEmulatorShared";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { CloudEvent, EventOptions, LegacyEvent } from "./events/types";

interface FunctionsShellController {
  call(trigger: EmulatedTriggerDefinition, data: any, opts: any): void;
}

export class FunctionsEmulatorShell implements FunctionsShellController {
  triggers: EmulatedTriggerDefinition[];
  emulatedFunctions: string[];
  urls: { [name: string]: string } = {};

  constructor(private emu: FunctionsEmulator) {
    this.triggers = emu.getTriggerDefinitions();
    this.emulatedFunctions = this.triggers.map((t) => t.id);

    const entryPoints = this.triggers.map((t) => t.entryPoint);
    utils.logLabeledBullet("functions", `Loaded functions: ${entryPoints.join(", ")}`);

    for (const trigger of this.triggers) {
      if (trigger.httpsTrigger) {
        this.urls[trigger.id] = FunctionsEmulator.getHttpFunctionUrl(
          this.emu.getProjectId(),
          trigger.name,
          trigger.region,
          this.emu.getInfo() // EmulatorRegistry is not available in shell
        );
      }
    }
  }

  private createLegacyEvent(
    eventTrigger: Required<EmulatedTriggerDefinition>["eventTrigger"],
    data: unknown,
    opts: EventOptions
  ): LegacyEvent {
    // Resource could either be 'string' or '{ name: string, service: string }'
    let resource = opts.resource;
    if (typeof resource === "object" && resource.name) {
      resource = resource.name;
    }
    return {
      eventId: uuid.v4(),
      timestamp: new Date().toISOString(),
      eventType: eventTrigger.eventType,
      resource: resource as string,
      params: opts.params,
      auth: { admin: opts.auth?.admin || false, variable: opts.auth?.variable },
      data,
    };
  }

  private createCloudEvent(
    eventTrigger: Required<EmulatedTriggerDefinition>["eventTrigger"],
    data: unknown
  ): CloudEvent<unknown> {
    let source = "";
    if (eventTrigger.eventType.startsWith("google.cloud.storage")) {
      source = `projects/_/buckets/${eventTrigger.eventFilters?.bucket}`;
    } else if (eventTrigger.eventType.startsWith("google.cloud.pubsub")) {
      source = eventTrigger.eventFilters!.topic!;
      data = { ...(data as any), messageId: uuid.v4() };
    } else if (eventTrigger.eventType.startsWith("google.cloud.firestore")) {
      source = `projects/my-project/databases/(default)`;
    } else if (eventTrigger.eventType.startsWith("google.firebase.database")) {
      source = `projects/_/locations/_/instances/${eventTrigger.eventFilterPathPatterns?.instance}`;
    }
    return {
      specversion: "1.0",
      datacontenttype: "application/json",
      id: uuid.v4(),
      type: eventTrigger.eventType,
      time: new Date().toISOString(),
      data,
      source,
    };
  }

  call(trigger: EmulatedTriggerDefinition, data: any, opts: EventOptions): void {
    logger.debug(`shell:${trigger.name}: trigger=${JSON.stringify(trigger)}`);
    logger.debug(
      `shell:${trigger.name}: opts=${JSON.stringify(opts)}, data=${JSON.stringify(data)}`
    );

    const eventTrigger = trigger.eventTrigger;
    if (!eventTrigger) {
      throw new FirebaseError(`Function ${trigger.name} is not a background function`);
    }

    let body;
    if (trigger.platform === "gcfv1") {
      body = this.createLegacyEvent(eventTrigger, data, opts);
    } else {
      body = this.createCloudEvent(eventTrigger, data);
    }
    this.emu.sendRequest(trigger, body);
  }
}
