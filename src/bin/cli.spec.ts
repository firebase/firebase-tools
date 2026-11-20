import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { loadAllCommands, removeDebugLog } from "./cli";

interface MockCommand {
  (): void;
  load: sinon.SinonStub;
  [key: string]: unknown;
}

function makeCommand(): MockCommand {
  const fn = function () {
    return undefined;
  } as MockCommand;
  fn.load = sinon.stub();
  return fn;
}

describe("cli loadAllCommands", () => {
  it("loads commands nested under a plain namespace object", () => {
    const authExport = makeCommand();
    const client: Record<string, unknown> = {
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
    const loginAdd = makeCommand();
    const loginList = makeCommand();
    login.add = loginAdd;
    login.list = loginList;

    const client: Record<string, unknown> = {
      cli: {},
      login,
    };

    loadAllCommands(client);

    expect(login.load.calledOnce, "bare login command loaded").to.be.true;
    expect(loginAdd.load.calledOnce, "login:add loaded").to.be.true;
    expect(loginList.load.calledOnce, "login:list loaded").to.be.true;
  });

  it("does not traverse the `cli` property and ignores arrays", () => {
    const open = makeCommand();
    const cliCommand = makeCommand();
    const arrayCommand = makeCommand();
    const client: Record<string, unknown> = {
      cli: { commands: [cliCommand] }, // cli is intentionally not traversed
      list: [arrayCommand], // arrays are not traversed
      open,
    };

    loadAllCommands(client);

    expect(open.load.calledOnce).to.be.true;
    expect(cliCommand.load.called, "cli subtree skipped").to.be.false;
    expect(arrayCommand.load.called, "array entries skipped").to.be.false;
  });
});

describe("cli removeDebugLog", () => {
  const originalDebug = process.env.DEBUG;
  let tmpDir: string;
  let logFile: string;

  beforeEach(() => {
    delete process.env.DEBUG;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-cli-test-"));
    logFile = path.join(tmpDir, "firebase-debug.log");
    fs.writeFileSync(logFile, "log");
  });

  afterEach(() => {
    sinon.restore();
    if (originalDebug !== undefined) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deletes the debug log when the command did not fail", () => {
    removeDebugLog(logFile, 0);

    expect(fs.existsSync(logFile)).to.be.false;
  });

  it("keeps the debug log when the command failed", () => {
    removeDebugLog(logFile, 2);

    expect(fs.existsSync(logFile)).to.be.true;
  });

  it("does not throw when the debug log cannot be deleted", () => {
    const err = Object.assign(new Error(`EBUSY: resource busy or locked, unlink '${logFile}'`), {
      code: "EBUSY",
    });
    const unlinkSync = sinon.stub(fs, "unlinkSync").throws(err);

    expect(() => removeDebugLog(logFile, 0)).not.to.throw();
    expect(unlinkSync.calledOnceWith(logFile)).to.be.true;
  });
});
