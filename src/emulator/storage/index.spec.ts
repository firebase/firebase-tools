import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import { StorageEmulator } from "./index";

describe("StorageEmulator", () => {
  const rules = { name: "storage.rules", content: "" };
  let emulators: StorageEmulator[] = [];

  function createEmulator(): StorageEmulator {
    const emulator = new StorageEmulator({ projectId: "demo-project", rules });
    emulators = [...emulators, emulator];
    return emulator;
  }

  async function stopEmulator(emulator: StorageEmulator): Promise<void> {
    emulators = emulators.filter((e) => e !== emulator);
    await emulator.stop();
  }

  afterEach(async () => {
    await Promise.all(emulators.map((emulator) => emulator.stop()));
    emulators = [];
  });

  it("should give each instance its own blob directory", () => {
    const first = createEmulator();
    const second = createEmulator();

    expect(first.storageLayer.dirPath).to.not.equal(second.storageLayer.dirPath);
  });

  it("should not delete another instance's blobs when it stops", async () => {
    const first = createEmulator();
    const second = createEmulator();
    const blobPath = path.join(first.storageLayer.dirPath, "blob");
    fs.writeFileSync(blobPath, "hello world");

    await stopEmulator(second);

    expect(fs.existsSync(blobPath)).to.be.true;
  });
});
