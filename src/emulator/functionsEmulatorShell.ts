import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition, getFunctionRegion } from "./functionsEmulatorShared";

class FunctionsController {
  constructor(private emu: FunctionsEmulator) {}

  // TODO: Stronger types
  call(name: string, data: any, options: any): void {
    const proto = {
      context: {
        resource: {
          name: options.resource
        }
      },
      data
    }

    console.log("options\n\t", JSON.stringify(options));
    console.log("proto\n\t", JSON.stringify(proto));
    this.emu.startFunctionRuntime(name, proto);
  }
}

export class FunctionsEmulatorShell {
  public controller: FunctionsController;
  public triggers: EmulatedTriggerDefinition[];
  public emulatedFunctions: string[];
  public urls: { [name: string]: string } = {};

  // TODO:
  //  * Disable some advanced emulator features
  //  * Quiet some logging
  constructor(private emu: FunctionsEmulator) {
    this.controller = new FunctionsController(this.emu);
    this.triggers = emu.getTriggers().filter(FunctionsEmulator.isTriggerSupported);
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
}
