import { expect } from "chai";
import { crc32c, crc32cToString } from "./crc";

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
