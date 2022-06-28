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

import { calculateChannelExpireTTL } from "../../hosting/expireUtils";
import { FirebaseError } from "../../error";

describe("calculateChannelExpireTTL", () => {
  const goodTests = [
    { input: "30d", want: 30 * 24 * 60 * 60 * 1000 },
    { input: "1d", want: 24 * 60 * 60 * 1000 },
    { input: "2d", want: 2 * 24 * 60 * 60 * 1000 },
    { input: "2h", want: 2 * 60 * 60 * 1000 },
    { input: "56m", want: 56 * 60 * 1000 },
  ];

  for (const test of goodTests) {
    it(`should be able to parse time ${test.input}`, () => {
      const got = calculateChannelExpireTTL(test.input);
      expect(got).to.equal(test.want, `unexpected output for ${test.input}`);
    });
  }

  const badTests = [{ input: "1.5d" }, { input: "2x" }, { input: "2dd" }, { input: "0.5m" }];

  for (const test of badTests) {
    it(`should be able to parse time ${test.input}`, () => {
      expect(() => calculateChannelExpireTTL(test.input)).to.throw(
        FirebaseError,
        /flag must be a duration string/
      );
    });
  }

  it("should throw if greater than 30d", () => {
    expect(() => calculateChannelExpireTTL("31d")).to.throw(
      FirebaseError,
      /not be longer than 30d/
    );
    expect(() => calculateChannelExpireTTL(`${31 * 24}h`)).to.throw(
      FirebaseError,
      /not be longer than 30d/
    );
  });
});
