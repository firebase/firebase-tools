import { expect } from "chai";
import { RemoteConfigEmulator } from "../../../emulator/remoteconfig";

const emulatorTemplate = require("./emulator-template.json");
const prodTemplate = require("./prod-template.json");

describe("templates", () => {
  it("can remove !isEmulator parameters", () => {
    const extractedTemplate = RemoteConfigEmulator.extractEmulator(emulatorTemplate);
    expect(extractedTemplate).to.deep.equal(prodTemplate);
  });

  it("can prepare template for emulator", () => {
    const emulatorReadyTemplate = RemoteConfigEmulator.prepareEmulatorTemplate(prodTemplate);
    console.log(JSON.stringify(emulatorReadyTemplate, null, 2));
    console.log(JSON.stringify(emulatorTemplate, null, 2));
    expect(emulatorReadyTemplate).to.deep.equal(emulatorTemplate);
  });
});
