import { expect } from "chai";
import { crc32c, crc32cToString } from "./crc.js";
import { Buffer } from "node:buffer";
import stringTestCases from "./crc-string-cases.json" with { type: "json" };
import bufferTestCases from "./crc-buffer-cases.json" with { type: "json" };
import toStringTestCases from "./crc-to-string-cases.json" with { type: "json" };
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
