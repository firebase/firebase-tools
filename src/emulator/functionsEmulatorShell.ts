import * as _ from "lodash";
import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition, getFunctionRegion } from "./functionsEmulatorShared";
import * as logger from "../logger";

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

    for (const t of this.triggers) {
      if (t.httpsTrigger) {
        const name = t.name;
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
    // TODO: How can I not stuff the name in so many places?
    if (data.value) {
      data.value.name = opts.resource;
    }

    if (data.oldValue) {
      data.oldValue.name = opts.resource;
    }

    const proto = {
      context: {
        resource: {
          name: opts.resource,
          // TODO: How do I tell what type of function it is?
          service: "firestore.googleapis.com",
        },
      },
      data,
    };

    // TODO: delete these logs
    logger.debug("options\n\t", JSON.stringify(opts));
    logger.debug("proto\n\t", JSON.stringify(proto, undefined, 2));
    this.emu.startFunctionRuntime(name, proto);
  }
}
