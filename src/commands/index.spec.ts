import { expect } from "chai";
import { Command as Program } from "commander";
import * as sinon from "sinon";

import { CLIClient, isCommandModule } from "../command";
import * as experiments from "../experiments";
import { load } from "./index";

function loadRegisteredCommands(obj: Record<string, unknown>, seen = new Set<unknown>()): void {
  if (seen.has(obj)) return;
  seen.add(obj);
  for (const [key, value] of Object.entries(obj)) {
    if (key === "cli") continue;
    if (isCommandModule(value)) {
      value.load();
    }
    if (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      !Array.isArray(value)
    ) {
      loadRegisteredCommands(value as Record<string, unknown>, seen);
    }
  }
}

describe("commands/index", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("loads all registered commands including experiment-gated commands without error", () => {
    sinon.stub(experiments, "isEnabled").returns(true);
    const program = new Program();
    const client = load({
      cli: program as unknown as CLIClient["cli"],
      errorOut: sinon.stub(),
    });

    expect(() => loadRegisteredCommands(client as Record<string, unknown>)).not.to.throw();

    const registeredNames = program.commands.map((cmd: { name: () => string }) => cmd.name());
    expect(registeredNames).to.include("crashlytics:setup");
    expect(registeredNames).to.not.include("crashlytics:onboard:web");
  }).timeout(15000);

  it("registers crashlytics:setup under client.crashlytics.setup", () => {
    const program = new Program();
    const client = load({
      cli: program as unknown as CLIClient["cli"],
      errorOut: sinon.stub(),
    });

    const crashlytics = client.crashlytics as Record<string, unknown>;
    expect(isCommandModule(crashlytics.setup)).to.be.true;
    expect(crashlytics.onboard).to.be.undefined;

    if (isCommandModule(crashlytics.setup)) {
      crashlytics.setup.load();
    }
    const registeredNames = program.commands.map((cmd: { name: () => string }) => cmd.name());
    expect(registeredNames).to.include("crashlytics:setup");
  });
});
