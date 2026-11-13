import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import { StorageEmulator } from "./index";

describe("StorageEmulator", () => {
  const rules = { name: "storage.rules", content: "" };

  function createEmulator(): StorageEmulator {
    return new StorageEmulator({ projectId: "demo-project", rules });
  }

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

    await second.stop();

    expect(fs.existsSync(blobPath)).to.be.true;
    await first.stop();
  });
});
