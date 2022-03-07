import { expect } from "chai";
import { tmpdir } from "os";

import { v4 as uuidV4 } from "uuid";
import { Persistence } from "../../../emulator/storage/persistence";

describe("Persistence", () => {
  const testDir = `${tmpdir()}/${uuidV4()}`;
  const _persistence = new Persistence(testDir);
  after(async () => {
    await _persistence.deleteAll();
  });

  describe("#deleteFile()", () => {
    it("should delete files", () => {
      const filename = `${uuidV4()}%2F${uuidV4()}`;
      _persistence.appendBytes(filename, Buffer.from("hello world"));

      _persistence.deleteFile(filename);
      expect(() => _persistence.readBytes(filename, 10)).to.throw;
    });
  });

  describe("#readBytes()", () => {
    it("should read existing files", () => {
      const filename = `${uuidV4()}%2F${uuidV4()}`;
      const data = Buffer.from("hello world");

      _persistence.appendBytes(filename, data);
      expect(_persistence.readBytes(filename, data.byteLength).toString()).to.equal("hello world");
    });
  });
});
