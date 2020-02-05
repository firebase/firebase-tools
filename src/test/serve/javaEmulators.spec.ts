import { expect } from "chai";
import * as path from "path";

import * as javaEmulators from "../../serve/javaEmulators";
import { Emulators } from "../../emulator/types";

type DownloadableEmulator = Emulators.FIRESTORE | Emulators.DATABASE | Emulators.PUBSUB;

function checkDownloadPath(name: DownloadableEmulator) {
  const emulator = javaEmulators.getDownloadDetails(name);
  expect(path.basename(emulator.opts.remoteUrl)).to.include(path.basename(emulator.downloadPath));
}

describe("downloadDetails", () => {
  it("should match part of remoteUrl", async () => {
    checkDownloadPath(Emulators.FIRESTORE);
    checkDownloadPath(Emulators.DATABASE);
    checkDownloadPath(Emulators.PUBSUB);
  });
});
