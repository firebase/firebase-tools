import * as _ from "lodash";
import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition, getFunctionRegion } from "./functionsEmulatorShared";
import * as utils from "../utils";
import * as logger from "../logger";
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
    logger.debug(`shell:${name}: opts=${JSON.stringify(opts)}, data=${JSON.stringify(data)}`);

    const trigger = this.getTrigger(name);
    const service = trigger.eventTrigger ? trigger.eventTrigger.service : "unknown";

    // THIS:
    const myCtx = {
      authType: "USER",
      auth: {
        uid: "abc",
        token: {},
      },
      params: {
        doc: "a",
      },
      resource: {
        name: "projects/_/instances/fir-dumpster/refs/foo/a",
        service: "firebaseio.com",
      },
    };

    // PROD:
    const prodCtx = {
      // THESE THREE THINGS MISSING
      eventId: "f56d14e9-8ce6-47fc-a9dd-f03f19cc5dc9",
      timestamp: "2019-05-14T19:35:52.839Z",
      eventType: "google.firebase.database.ref.write",

      authType: "USER",
      auth: {
        uid: "abc",
        token: {},
      },
      params: {
        doc: "a",
      },
      resource: {
        service: "firebaseio.com",
        name: "projects/_/instances/fir-dumpster/refs/foo/a",
      },
    };

    const resourceName = opts.resource;
    const resource = {
      name: resourceName,
      service,
    };

    const proto = {
      context: {
        ...opts,
        resource,
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

    this.emu.startFunctionRuntime(name, proto);
  }

  private getTrigger(name: string) {
    return this.triggers.filter((def) => {
      return def.name === name;
    })[0];
  }
}
