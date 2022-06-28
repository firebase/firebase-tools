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
import { crc32c, crc32cToString } from "../../../emulator/storage/crc";

/**
 * Test cases adapated from:
 * https://github.com/ashi009/node-fast-crc32c/blob/master/test/sets.json
 */
const stringTestCases: {
  cases: { input: string; want: number }[];
} = require("./crc-string-cases.json");

/**
 * Test cases adapated from:
 * https://github.com/ashi009/node-fast-crc32c/blob/master/test/sets.json
 */
const bufferTestCases: {
  cases: { input: number[]; want: number }[];
} = require("./crc-buffer-cases.json");

const toStringTestCases: {
  cases: { input: string; want: string }[];
} = require("./crc-to-string-cases.json");

describe("crc", () => {
  it("correctly computes crc32c from a string", () => {
    const cases = stringTestCases.cases;
    for (const c of cases) {
      expect(crc32c(Buffer.from(c.input))).to.equal(c.want);
    }
  });

  it("correctly computes crc32c from bytes", () => {
    const cases = bufferTestCases.cases;
    for (const c of cases) {
      expect(crc32c(Buffer.from(c.input))).to.equal(c.want);
    }
  });

  it("correctly stringifies crc32c", () => {
    const cases = toStringTestCases.cases;
    for (const c of cases) {
      const value = crc32c(Buffer.from(c.input));
      const result = crc32cToString(value);

      expect(result).to.equal(c.want);
    }
  });
});
