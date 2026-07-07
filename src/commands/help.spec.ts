import * as sinon from "sinon";
import { expect } from "chai";
import { command as helpCommand } from "./help";
import { logger } from "../logger";

describe("help command namespace listing", () => {
  let loggerStub: sinon.SinonStub;

  beforeEach(() => {
    loggerStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should show help for namespace subcommands", async () => {
    const mockEnableCommand = {
      _name: "ailogic:providers:enable",
      _description: "enable a provider",
      outputHelp: sinon.stub(),
    };
    const mockDisableCommand = {
      _name: "ailogic:providers:disable",
      _description: "disable a provider",
      outputHelp: sinon.stub(),
    };

    const mockClient = {
      cli: {
        commands: [mockEnableCommand, mockDisableCommand],
        outputHelp: sinon.stub(),
      },
      getCommand: sinon.stub().returns(undefined),
      ailogic: {
        providers: {},
      },
    };

    // Run help command action with mock context
    const actionFn = (helpCommand as any).actionFn;
    await actionFn.call({ client: mockClient }, "ailogic:providers");

    // It should log the subcommands and descriptions
    expect(loggerStub).to.have.been.called;
    const allArgs = loggerStub.args.map((a) => a.join(" ")).join("\n");
    expect(allArgs).to.include("Commands under ailogic:providers:");
    expect(allArgs).to.include("ailogic:providers:enable");
    expect(allArgs).to.include("enable a provider");
    expect(allArgs).to.include("ailogic:providers:disable");
    expect(allArgs).to.include("disable a provider");
  });
});
