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

import { FirebaseError } from "../../error";
import { encodeFirestoreValue } from "../../firestore/encodeFirestoreValue";

describe("encodeFirestoreValue", () => {
  it("should encode known types", () => {
    const d = new Date();
    const tests = [
      { in: { foo: "str" }, res: { foo: { stringValue: "str" } } },
      { in: { foo: true }, res: { foo: { booleanValue: true } } },
      { in: { foo: 1 }, res: { foo: { integerValue: 1 } } },
      { in: { foo: 3.14 }, res: { foo: { doubleValue: 3.14 } } },
      { in: { foo: d }, res: { foo: { timestampValue: d.toISOString() } } },
      {
        in: { foo: ["str", true] },
        res: { foo: { arrayValue: { values: [{ stringValue: "str" }, { booleanValue: true }] } } },
      },
      { in: { foo: null }, res: { foo: { nullValue: "NULL_VALUE" } } },
      { in: { foo: Buffer.from("buffer") }, res: { foo: { bytesValue: Buffer.from("buffer") } } },
      {
        in: { foo: { nested: true } },
        res: { foo: { mapValue: { fields: { nested: { booleanValue: true } } } } },
      },
    ];

    for (const test of tests) {
      expect(encodeFirestoreValue(test.in)).to.deep.equal(test.res);
    }
  });

  it("should throw an error with unknown types", () => {
    const tests = [
      { in: { foo: undefined } },
      { in: { foo: process.stdout } },
      { in: { foo: /regex/ } },
    ];

    for (const test of tests) {
      expect(() => encodeFirestoreValue(test.in)).to.throw(FirebaseError);
    }
  });
});
