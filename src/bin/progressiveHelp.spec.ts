import { expect } from "chai";
import { setupProgressiveHelp, CommanderCommand } from "./progressiveHelp";
import { CLIClient } from "../command";
import { CommanderStatic } from "commander";

interface MockCommand extends CommanderCommand {
  _name: string;
  _description: string;
  commands: MockCommand[];
  capturedCommands: MockCommand[];
  description(desc: string): MockCommand;
  action(cb: () => void): MockCommand;
  on(event: string, callback: () => void): MockCommand;
  command(name: string): MockCommand;
}

describe("progressiveHelp", () => {
  let mockProgram: MockCommand;
  let mockClient: CLIClient;

  beforeEach(() => {
    const createMockCommand = (name: string): MockCommand => {
      const cmd = {
        _name: name,
        _description: "",
        commands: [] as MockCommand[],
        capturedCommands: [] as MockCommand[],
        name() {
          return this._name;
        },
        description(desc: string) {
          this._description = desc;
          return this;
        },
        action() {
          return this;
        },
        on() {
          return this;
        },
        helpInformation: function (this: CommanderCommand) {
          const self = this as unknown as MockCommand;
          self.capturedCommands = [...self.commands];
          return "";
        },
        command(childName: string) {
          const childCmd = createMockCommand(childName);
          this.commands.push(childCmd);
          return childCmd;
        },
      };
      return cmd;
    };

    mockProgram = createMockCommand("firebase");

    mockClient = {
      cli: mockProgram as unknown as CommanderStatic,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      errorOut: () => {},
    };
  });

  it("registers missing intermediate namespaces", () => {
    // Register leaf commands directly
    mockProgram.command("firestore:databases:create");
    mockProgram.command("firestore:databases:list");
    mockProgram.command("firestore:delete");
    mockProgram.command("deploy");

    setupProgressiveHelp(mockClient);

    const registeredNames = mockProgram.commands.map((cmd: MockCommand) => cmd.name());

    // Should register "firestore" and "firestore:databases"
    expect(registeredNames).to.include("firestore");
    expect(registeredNames).to.include("firestore:databases");
  });

  it("patches helpInformation to filter commands based on progressive prefix", () => {
    mockProgram.command("deploy");
    const firestore = mockProgram.command("firestore");
    mockProgram.command("firestore:delete");
    const fDatabases = mockProgram.command("firestore:databases");
    mockProgram.command("firestore:databases:create");
    mockProgram.command("firestore:databases:list");

    setupProgressiveHelp(mockClient);

    // 1. Test root program filtering
    mockProgram.helpInformation();
    const rootNames = mockProgram.capturedCommands.map((c) => c.name());
    expect(rootNames).to.have.members(["deploy", "firestore"]);

    // 2. Test "firestore" namespace filtering
    firestore.helpInformation();
    const firestoreNames = firestore.capturedCommands.map((c) => c.name());
    expect(firestoreNames).to.have.members(["firestore:delete", "firestore:databases"]);

    // 3. Test "firestore:databases" namespace filtering
    fDatabases.helpInformation();
    const dbNames = fDatabases.capturedCommands.map((c) => c.name());
    expect(dbNames).to.have.members(["firestore:databases:create", "firestore:databases:list"]);
  });
});
