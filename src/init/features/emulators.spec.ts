import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../../prompt"; // Adjust path as needed
import { doSetup } from "./emulators"; // Adjust path as needed
import { Config } from "../../config"; // Adjust path as needed
import { Emulators } from "../../emulator/types";

describe("Emulators Init Feature", () => {
  let confirmStub: sinon.SinonStub;
  let inputStub: sinon.SinonStub;
  let checkboxStub: sinon.SinonStub;
  let setup: any;
  let config: Config;

  beforeEach(() => {
    confirmStub = sinon.stub(prompt, "confirm");
    inputStub = sinon.stub(prompt, "input");
    checkboxStub = sinon.stub(prompt, "checkbox");

    config = new Config({}, {}); // Basic config
    setup = {
      config: { emulators: {} }, // Ensure emulators property exists
      rcfile: {},
    };
  });

  afterEach(() => {
    confirmStub.restore();
    inputStub.restore();
    checkboxStub.restore();
  });

  it("should ask for dataDir and set it in config if user confirms", async () => {
    checkboxStub.resolves([Emulators.FIRESTORE]); // Simulate selecting at least one emulator
    confirmStub.withArgs(sinon.match("Would you like to automatically save emulator data")).resolves(true);
    inputStub.withArgs(sinon.match("What directory would you like to save your emulator data to?")).resolves("./my_emulator_data");
    confirmStub.withArgs(sinon.match("Would you like to enable the Emulator UI?")).resolves(false); // Skip UI prompt
    confirmStub.withArgs(sinon.match("Would you like to download the emulators now?")).resolves(false); // Skip download prompt

    await doSetup(setup, config);

    expect(setup.config.emulators.dataDir).to.equal("./my_emulator_data");
    expect(confirmStub.calledWith(sinon.match("Would you like to automatically save emulator data"))).to.be.true;
    expect(inputStub.calledWith(sinon.match("What directory would you like to save your emulator data to?"))).to.be.true;
  });

  it("should not ask for dataDir path if user declines data persistence", async () => {
    checkboxStub.resolves([Emulators.FIRESTORE]);
    confirmStub.withArgs(sinon.match("Would you like to automatically save emulator data")).resolves(false);
    confirmStub.withArgs(sinon.match("Would you like to enable the Emulator UI?")).resolves(false);
    confirmStub.withArgs(sinon.match("Would you like to download the emulators now?")).resolves(false);

    await doSetup(setup, config);

    expect(setup.config.emulators.dataDir).to.be.undefined;
    expect(confirmStub.calledWith(sinon.match("Would you like to automatically save emulator data"))).to.be.true;
    expect(inputStub.calledWith(sinon.match("What directory would you like to save your emulator data to?"))).to.be.false;
  });

   it("should not ask for dataDir if no emulators are selected", async () => {
    checkboxStub.resolves([]); // No emulators selected
    // No need to stub other confirms/inputs as the function should exit early or skip these.

    await doSetup(setup, config);

    expect(setup.config.emulators.dataDir).to.be.undefined;
    expect(confirmStub.calledWith(sinon.match("Would you like to automatically save emulator data"))).to.be.false;
    expect(inputStub.calledWith(sinon.match("What directory would you like to save your emulator data to?"))).to.be.false;
  });
});
