import * as _ from "lodash";
import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition, getFunctionRegion } from "./functionsEmulatorShared";
import * as utils from "../utils";
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
    const proto = {
      context: {
        resource: opts.resource,
      },
      data,
    };

    const trigger = this.getTrigger(name);
    const service = trigger.eventTrigger ? trigger.eventTrigger.service : "unknown";

    // TODO: This should NOT be necessary!
    if (service === Constants.SERVICE_FIRESTORE) {
      if (proto.data.value) {
        proto.data.value.name = proto.context.resource;
      }

      if (proto.data.oldValue) {
        proto.data.oldValue.name = proto.context.resource;
      }
    }

    this.emu.startFunctionRuntime(name, proto);
  }

  private getTrigger(name: string) {
    return this.triggers.filter((def) => {
      return def.name === name;
    })[0];
  }
}
