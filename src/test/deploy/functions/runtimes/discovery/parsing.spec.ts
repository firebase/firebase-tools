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
import { FirebaseError } from "../../../../../error";
import * as parsing from "../../../../../deploy/functions/runtimes/discovery/parsing";

describe("requireKeys", () => {
  it("accepts found keys", () => {
    const obj = {
      foo: "foo",
      bar: "bar",
    };
    parsing.requireKeys("", obj, "foo", "bar");
  });

  it("throws for missing keys", () => {
    const obj = {
      foo: "foo",
    } as any;
    expect(() => parsing.requireKeys("", obj, "foo", "bar")).to.throw(
      FirebaseError,
      "Expected key bar"
    );
  });

  it("uses prefixes in error messages", () => {
    const obj = {
      foo: {
        bar: 1,
      },
    } as any;
    expect(() => parsing.requireKeys("foo", obj.foo, "baz")).to.throw(
      FirebaseError,
      "Expected key foo.baz"
    );
  });
});

describe("assertKeyTypes", () => {
  const tests = ["string", "number", "boolean", "array", "object"];
  const values = {
    null: null,
    undefined: undefined,
    number: 0,
    boolean: false,
    string: "",
    array: [],
    object: {},
  };
  for (const type of tests) {
    for (const [testType, val] of Object.entries(values)) {
      const schema = { [type]: type as parsing.KeyType<typeof val> };
      it(`handles a ${testType} when expecting a ${type}`, () => {
        const obj = { [type]: val };
        if (type === testType) {
          expect(() => parsing.assertKeyTypes("", obj, schema)).not.to.throw();
        } else {
          expect(() => parsing.assertKeyTypes("", obj, schema)).to.throw(FirebaseError);
        }
      });
    }
  }

  it("handles validator functions", () => {
    interface hasCPU {
      cpu: number | "gcf_gen1";
    }

    const literalCPU: hasCPU = {
      cpu: 1,
    };

    const symbolicCPU: hasCPU = {
      cpu: "gcf_gen1",
    };

    const badCPU: hasCPU = {
      cpu: "bad" as any,
    };

    const schema = {
      cpu: (val: hasCPU["cpu"]) => typeof val === "number" || val === "gcf_gen1",
    };
    expect(() => parsing.assertKeyTypes("", literalCPU, schema)).to.not.throw();
    expect(() => parsing.assertKeyTypes("", symbolicCPU, schema)).to.not.throw();
    expect(() => parsing.assertKeyTypes("", badCPU, schema)).to.throw();
  });

  it("Throws on superfluous keys", () => {
    const obj = { foo: "bar", number: 1 } as any;
    expect(() =>
      parsing.assertKeyTypes("", obj, {
        foo: "string",
      })
    ).to.throw(FirebaseError, /Unexpected key number/);
  });

  // Omit isn't really useful at runtime, but it allows us to
  // use the type system to declare that all fields of T have
  // a corresponding schema type.
  it("Ignores 'omit' keys", () => {
    const obj = { foo: "bar", number: 1 } as any;
    expect(() =>
      parsing.assertKeyTypes("", obj, {
        foo: "string",
        number: "omit",
      })
    );
  });

  it("Handles prefixes", () => {
    const obj = {
      foo: {},
    } as any;
    expect(() =>
      parsing.assertKeyTypes("outer", obj, {
        foo: "array",
      })
    ).to.throw(FirebaseError, "Expected outer.foo to be an array");
  });
});
