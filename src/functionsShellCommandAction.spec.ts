import { expect } from "chai";

import { initializeFunctionsShellContext } from "./functionsShellCommandAction";
import { EmulatedTriggerDefinition } from "./emulator/functionsEmulatorShared";
import { FunctionsEmulatorShell } from "./emulator/functionsEmulatorShell";

describe("initializeFunctionsShellContext", () => {
  it("uses trigger.entryPoint for shell bindings", () => {
    const hyphenatedTrigger: EmulatedTriggerDefinition = {
      id: "us-central1-dummystore-bot",
      region: "us-central1",
      platform: "gcfv1",
      name: "dummystore-bot",
      entryPoint: "dummystore-bot",
      httpsTrigger: {},
    };
    const groupedTrigger: EmulatedTriggerDefinition = {
      id: "us-central1-grouped-fn",
      region: "us-central1",
      platform: "gcfv1",
      name: "grouped-fn",
      entryPoint: "grouped.fn",
      httpsTrigger: {},
    };

    const emulator = {
      triggers: [hyphenatedTrigger, groupedTrigger],
      emulatedFunctions: [hyphenatedTrigger.id, groupedTrigger.id],
      urls: {
        [hyphenatedTrigger.id]: "http://127.0.0.1/hyphenated",
        [groupedTrigger.id]: "http://127.0.0.1/grouped",
      },
    } as FunctionsEmulatorShell;

    const context: Record<string, unknown> = {};
    initializeFunctionsShellContext(context, emulator);

    expect(context).to.have.property("dummystore-bot").that.is.a("function");
    expect(context).to.not.have.nested.property("dummystore.bot");
    expect(context).to.have.nested.property("grouped.fn").that.is.a("function");
    expect(context).to.have.property("help").that.is.a("string");
  });
});
