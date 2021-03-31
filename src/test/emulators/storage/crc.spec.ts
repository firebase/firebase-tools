import { expect } from "chai";
import { crc32c } from "../../../emulator/storage/crc";

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
});
