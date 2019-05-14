import * as _ from "lodash";
import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition, getFunctionRegion } from "./functionsEmulatorShared";
import * as logger from "../logger";
import * as utils from "../utils";
import { Constants } from "./constants";

interface FunctionsShellController {
  call(name: string, data: any, opts: any): void;
}

export class FunctionsEmulatorShell implements FunctionsShellController {
  triggers: EmulatedTriggerDefinition[];
  emulatedFunctions: string[];
  urls: { [name: string]: string } = {};

  private triggerMap: { [name: string]: EmulatedTriggerDefinition } = {};

  constructor(private emu: FunctionsEmulator) {
    this.triggers = emu.getTriggers();
    this.emulatedFunctions = this.triggers.map((t) => {
      return t.name;
    });

    utils.logLabeledBullet("functions", `Loaded functions: ${this.emulatedFunctions.join(", ")}`);

    for (const t of this.triggers) {
      const name = t.name;
      this.triggerMap[name] = t;

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
    const trigger = this.triggerMap[name];

    let service = undefined;
    if (trigger.eventTrigger) {
      service = trigger.eventTrigger.service;
    }

    const proto = {
      context: {
        resource: opts.resource,
      },
      data,
    };

    // TODO: delete these logs
    logger.debug("options\n\t", JSON.stringify(opts));
    logger.debug("proto\n\t", JSON.stringify(proto, undefined, 2));
    this.emu.startFunctionRuntime(name, proto);
  }
}
