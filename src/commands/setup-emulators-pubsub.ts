import * as Command from "../command";

const downloadEmulator = require("../emulator/download");
const emulatorName = "pubsub";

module.exports = new Command("setup:emulators:" + emulatorName)
    .description("downloads the " + emulatorName + " emulator")
    .action(() => {
        return downloadEmulator(emulatorName);
    });
