import { expect } from "chai";
import * as sinon from "sinon";

import { command as extInfoCommand } from "./ext-info";
import * as localHelper from "../extensions/localHelper";
import { logger } from "../logger";
import { ExtensionSpec } from "../extensions/types";

describe("ext:info command", () => {
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  const baseSpec: ExtensionSpec = {
    name: "test-extension",
    version: "1.0.0",
    displayName: "Test Extension",
    description: "An extension for testing.",
    resources: [],
    params: [],
    systemParams: [],
  };

  it("should display events emitted in markdown mode when events are defined", async () => {
    const specWithEvents: ExtensionSpec = {
      ...baseSpec,
      events: [
        {
          type: "google.firebase.v1.custom-event",
          description: "Occurs when a custom event is triggered.",
        },
        {
          type: "google.firebase.v1.completed",
          description: "Occurs when processing completes.",
        },
      ],
    };

    sinon.stub(localHelper, "isLocalExtension").returns(true);
    sinon.stub(localHelper, "getLocalExtensionSpec").resolves(specWithEvents);

    await extInfoCommand.runner()("./test-dir", { markdown: true });

    expect(loggerInfoStub).to.have.been.calledOnce;
    const output = loggerInfoStub.firstCall.args[0] as string;

    expect(output).to.include("**Events Emitted:**");
    expect(output).to.include(
      "* google.firebase.v1.custom-event: Occurs when a custom event is triggered.",
    );
    expect(output).to.include("* google.firebase.v1.completed: Occurs when processing completes.");
  });

  it("should display event types without colon when description is not provided", async () => {
    const specWithEvents: ExtensionSpec = {
      ...baseSpec,
      events: [
        {
          type: "google.firebase.v1.no-desc",
          description: "",
        },
      ],
    };

    sinon.stub(localHelper, "isLocalExtension").returns(true);
    sinon.stub(localHelper, "getLocalExtensionSpec").resolves(specWithEvents);

    await extInfoCommand.runner()("./test-dir", { markdown: true });

    expect(loggerInfoStub).to.have.been.calledOnce;
    const output = loggerInfoStub.firstCall.args[0] as string;

    expect(output).to.include("**Events Emitted:**");
    expect(output).to.include("* google.firebase.v1.no-desc");
    expect(output).to.not.include("* google.firebase.v1.no-desc:");
  });

  it("should not display events emitted section when spec has no events", async () => {
    sinon.stub(localHelper, "isLocalExtension").returns(true);
    sinon.stub(localHelper, "getLocalExtensionSpec").resolves(baseSpec);

    await extInfoCommand.runner()("./test-dir", { markdown: true });

    expect(loggerInfoStub).to.have.been.calledOnce;
    const output = loggerInfoStub.firstCall.args[0] as string;

    expect(output).to.not.include("Events Emitted");
  });

  it("should display events in terminal mode when events are defined", async () => {
    const specWithEvents: ExtensionSpec = {
      ...baseSpec,
      events: [
        {
          type: "google.firebase.v1.terminal-event",
          description: "Triggered in terminal mode.",
        },
      ],
    };

    sinon.stub(localHelper, "isLocalExtension").returns(true);
    sinon.stub(localHelper, "getLocalExtensionSpec").resolves(specWithEvents);

    await extInfoCommand.runner()("./test-dir", { markdown: false });

    const allOutput = loggerInfoStub.args.map((args) => args.join(" ")).join("\n");
    expect(allOutput).to.include("Events Emitted");
    expect(allOutput).to.include("google.firebase.v1.terminal-event");
  });
});
