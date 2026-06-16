import { expect } from "chai";
import * as sinon from "sinon";

import { loadAllCommands } from "./cli";

function makeCommand(): any {
  const fn: any = function () {
    return undefined;
  };
  fn.load = sinon.stub();
  return fn;
}

describe("cli loadAllCommands", () => {
  it("loads commands nested under a plain namespace object", () => {
    const authExport = makeCommand();
    const client: any = {
      cli: {},
      auth: { export: authExport },
    };

    loadAllCommands(client);

    expect(authExport.load.calledOnce).to.be.true;
  });

  it("loads subcommands attached to a command that is also a namespace parent", () => {
    // `login`/`target`/`ext` are command functions that also carry their
    // subcommands as attached properties. All of them must be registered.
    const login = makeCommand();
    login.add = makeCommand();
    login.list = makeCommand();

    const client: any = {
      cli: {},
      login,
    };

    loadAllCommands(client);

    expect(login.load.calledOnce, "bare login command loaded").to.be.true;
    expect(login.add.load.calledOnce, "login:add loaded").to.be.true;
    expect(login.list.load.calledOnce, "login:list loaded").to.be.true;
  });

  it("does not traverse the `cli` property and ignores arrays", () => {
    const open = makeCommand();
    const client: any = {
      cli: { commands: [makeCommand()] }, // cli is intentionally not traversed
      list: [makeCommand()], // arrays are not traversed
      open,
    };

    loadAllCommands(client);

    expect(open.load.calledOnce).to.be.true;
    expect(client.cli.commands[0].load.called, "cli subtree skipped").to.be.false;
    expect(client.list[0].load.called, "array entries skipped").to.be.false;
  });
});
