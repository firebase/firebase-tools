import { expect } from "chai";
import { setupProgressiveHelp } from "./progressiveHelp";

describe("progressiveHelp", () => {
  let mockProgram: any;
  let mockClient: any;

  beforeEach(() => {
    mockProgram = {
      commands: [] as any[],
      capturedCommands: [] as any[],
      command(name: string) {
        const cmd = {
          _name: name,
          _description: "",
          commands: [] as any[],
          capturedCommands: [] as any[],
          _args: [] as any[],
          _aliases: [] as any[],
          options: [] as any[],
          helpInformation: function (this: any) {
            this.capturedCommands = [...this.commands];
            return "";
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
          name() {
            return this._name;
          },
        };
        mockProgram.commands.push(cmd);
        return cmd;
      },
      on() {
        return this;
      },
      helpInformation: function (this: any) {
        this.capturedCommands = [...this.commands];
        return "";
      },
    };

    mockClient = {
      cli: mockProgram,
    };
  });

  it("registers missing intermediate namespaces", () => {
    // Register leaf commands directly
    mockProgram.command("firestore:databases:create");
    mockProgram.command("firestore:databases:list");
    mockProgram.command("firestore:delete");
    mockProgram.command("deploy");

    setupProgressiveHelp(mockClient);

    const registeredNames = mockProgram.commands.map((cmd: any) => cmd.name());

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
    // Filtered root commands should be deploy & firestore (no colons)
    expect(mockProgram.capturedCommands).to.have.lengthOf(2);
    expect(mockProgram.capturedCommands[0].name()).to.equal("deploy");
    expect(mockProgram.capturedCommands[1].name()).to.equal("firestore");

    // 2. Test "firestore" namespace filtering
    firestore.helpInformation();
    // Under firestore namespace, should be firestore:delete and firestore:databases
    expect(firestore.capturedCommands).to.have.lengthOf(2);
    expect(firestore.capturedCommands[0].name()).to.equal("firestore:delete");
    expect(firestore.capturedCommands[1].name()).to.equal("firestore:databases");

    // 3. Test "firestore:databases" namespace filtering
    fDatabases.helpInformation();
    // Under firestore:databases namespace, should be firestore:databases:create and firestore:databases:list
    expect(fDatabases.capturedCommands).to.have.lengthOf(2);
    expect(fDatabases.capturedCommands[0].name()).to.equal("firestore:databases:create");
    expect(fDatabases.capturedCommands[1].name()).to.equal("firestore:databases:list");
  });
});
