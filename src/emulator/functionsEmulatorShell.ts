import * as uuid from "uuid";
import { EmulatableBackend, FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition, getSignatureType } from "./functionsEmulatorShared";
import * as utils from "../utils";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { LegacyEvent } from "./events/types";

interface FunctionsShellController {
  call(name: string, data: any, opts: any): void;
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
          this.emu.getInfo().host,
          this.emu.getInfo().port,
          this.emu.getProjectId(),
          trigger.name,
          trigger.region
        );
      }
    }
  }

  call(name: string, data: any, opts: any): void {
    const trigger = this.getTrigger(name);
    logger.debug(`shell:${name}: trigger=${JSON.stringify(trigger)}`);
    logger.debug(`shell:${name}: opts=${JSON.stringify(opts)}, data=${JSON.stringify(data)}`);

    if (!trigger.eventTrigger) {
      throw new FirebaseError(`Function ${name} is not a background function`);
    }

    const eventType = trigger.eventTrigger.eventType;

    // Resource could either be 'string' or '{ name: string, service: string }'
    let resource = opts.resource;
    if (typeof resource === "object" && resource.name) {
      resource = resource.name;
    }

    // TODO: We always use v1beta1 events for now, but we want to move
    //       to v1beta2 as soon as we can.
    const proto: LegacyEvent = {
      eventId: uuid.v4(),
      timestamp: new Date().toISOString(),
      eventType,
      resource,
      params: opts.params,
      auth: opts.auth,
      data,
    };

    this.emu.invokeTrigger(trigger, proto);
  }

  private getTrigger(name: string): EmulatedTriggerDefinition {
    const result = this.triggers.find((trigger) => {
      return trigger.name === name;
    });

    if (!result) {
      throw new FirebaseError(`Could not find trigger ${name}`);
    }

    return result;
  }
}
