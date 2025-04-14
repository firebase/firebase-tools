import { expect } from "chai";
import { tmpdir } from "os";
import * as fs from "fs";

import { v4 as uuidV4 } from "uuid";
import { Persistence } from "./persistence";

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
      expect(() => _persistence.readBytes(filename, 10)).to.throw();
    });
  });

  describe("#readBytes()", () => {
    it("should read existing files", () => {
      const filename = `${uuidV4()}%2F${uuidV4()}`;
      const data = Buffer.from("hello world");

      _persistence.appendBytes(filename, data);
      expect(_persistence.readBytes(filename, data.byteLength).toString()).to.equal("hello world");
    });
    it("should handle really long filename read existing files", () => {
      const filename = `${uuidV4()}%2F%${"long".repeat(180)}${uuidV4()}`;
      const data = Buffer.from("hello world");

      _persistence.appendBytes(filename, data);
      expect(_persistence.readBytes(filename, data.byteLength).toString()).to.equal("hello world");
    });
  });

  describe("#copyFromExternalPath()", () => {
    it("should copy files existing files", () => {
      const data = Buffer.from("hello world");
      const externalFilename = `${uuidV4()}%2F${uuidV4()}`;
      const externalFilePath = `${testDir}/${externalFilename}`;
      fs.appendFileSync(externalFilePath, data);

      const filename = `${uuidV4()}%2F${uuidV4()}`;

      _persistence.copyFromExternalPath(externalFilePath, filename);
      expect(_persistence.readBytes(filename, data.byteLength).toString()).to.equal("hello world");
    });
  });
});
