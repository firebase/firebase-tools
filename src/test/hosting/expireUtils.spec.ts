import { expect } from "chai";

import { calculateChannelExpireTTL } from "../../hosting/expireUtils";
import { FirebaseError } from "../../error";

describe("calculateChannelExpireTTL", () => {
  const goodTests = [
    { input: "30d", want: 30 * 24 * 60 * 60 * 1000 },
    { input: "1d", want: 24 * 60 * 60 * 1000 },
    { input: "2d", want: 2 * 24 * 60 * 60 * 1000 },
    { input: "2h", want: 2 * 60 * 60 * 1000 },
    { input: "56m", want: 56 * 60 * 1000 },
  ] as const;

  for (const test of goodTests) {
    it(`should be able to parse time ${test.input}`, () => {
      const got = calculateChannelExpireTTL(test.input);
      expect(got).to.equal(test.want, `unexpected output for ${test.input}`);
    });
  }

  const badTests = [
    { input: "1.5d" },
    { input: "2x" },
    { input: "2dd" },
    { input: "0.5m" },
    { input: undefined },
  ];

  for (const test of badTests) {
    it(`should be able to parse time ${test.input || "undefined"}`, () => {
      expect(() => calculateChannelExpireTTL(test.input as any)).to.throw(
        FirebaseError,
        /flag must be a duration string/,
      );
    });
  }

  it("should throw if greater than 30d", () => {
    expect(() => calculateChannelExpireTTL("31d")).to.throw(
      FirebaseError,
      /not be longer than 30d/,
    );
    expect(() => calculateChannelExpireTTL(`${31 * 24}h`)).to.throw(
      FirebaseError,
      /not be longer than 30d/,
    );
  });
});
