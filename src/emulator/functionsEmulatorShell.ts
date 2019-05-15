import * as _ from "lodash";
import * as uuid from "uuid";
import { FunctionsEmulator } from "./functionsEmulator";
import {
  EmulatedTriggerDefinition,
  getFunctionRegion,
  getFunctionService,
} from "./functionsEmulatorShared";
import * as utils from "../utils";
import * as logger from "../logger";
import * as FirebaseError from "../error";
import { Constants } from "./constants";

interface FunctionsShellController {
  call(name: string, data: any, opts: any): void;
}

export class FunctionsEmulatorShell implements FunctionsShellController {
  triggers: EmulatedTriggerDefinition[];
  emulatedFunctions: string[];
  urls: { [name: string]: string } = {};

  constructor(private emu: FunctionsEmulator) {
    this.triggers = emu.getTriggers();
    this.emulatedFunctions = this.triggers.map((t) => {
      return t.name;
    });

    utils.logLabeledBullet("functions", `Loaded functions: ${this.emulatedFunctions.join(", ")}`);

    for (const t of this.triggers) {
      const name = t.name;

      if (t.httpsTrigger) {
        this.urls[name] = FunctionsEmulator.getHttpFunctionUrl(
          this.emu.getInfo().port,
          this.emu.projectId,
          name,
          getFunctionRegion(t)
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

    const service = getFunctionService(trigger);
    const eventType = trigger.eventTrigger.eventType;
    const resource = opts.resource;

    const proto = {
      context: {
        eventId: uuid.v4(),
        timestamp: new Date().toISOString(),
        eventType,
        resource,
        params: opts.params,
        auth: opts.auth,
        authType: opts.authType,
      },
      data,
    };

    // TODO: This should NOT be necessary!
    if (service === Constants.SERVICE_FIRESTORE) {
      if (proto.data.value) {
        proto.data.value.name = resource.name;
      }

      if (proto.data.oldValue) {
        proto.data.oldValue.name = resource.name;
      }
    }

    FunctionsEmulator.startFunctionRuntime(
      this.emu.bundleTemplate,
      name,
      this.emu.nodeBinary,
      proto
    );
  }

  private getTrigger(name: string): EmulatedTriggerDefinition {
    const trig = this.triggers.find((def) => {
      return def.name === name;
    });

    if (!trig) {
      throw new FirebaseError(`Could not find trigger ${name}`);
    }

    return trig;
  }
}
