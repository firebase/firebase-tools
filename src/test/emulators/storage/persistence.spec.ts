/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
  });
});
