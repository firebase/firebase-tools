import { FunctionsEmulator } from "./functionsEmulator";
import { EmulatedTriggerDefinition } from "./functionsEmulatorShared";

// TODO: Real call
class FunctionsController {
  call(name: string, data: any, options: any): void {
    console.log("CALLING " + name);
  }
}

export class FunctionsEmulatorShell {

  public emulatedFunctions: string[];
  public triggers: EmulatedTriggerDefinition[];
  public urls: { [name:string]: string } = {};
  public controller: FunctionsController;
  
  // TODO: Disable a lot of flags
  constructor(private emu: FunctionsEmulator) {
    this.triggers = emu.getTriggers().filter(FunctionsEmulator.isTriggerSupported);
    this.emulatedFunctions = this.triggers.map((t) => {
      return t.name;
    });

    for (const t of this.triggers) {
      if (t.httpsTrigger) {
        const name = t.name;

        // TODO: Real stuff
        this.urls[name] = FunctionsEmulator.getHttpFunctionUrl(this.emu.getInfo().port, "FAKE-PROJ-ID", name, "us-central1");
      }
    }

    this.controller = new FunctionsController();
  }
}
