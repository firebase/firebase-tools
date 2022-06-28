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
import { SameType, RecursiveKeyOf, LeafElems, DeepPick, DeepOmit } from "../metaprogramming";

describe("metaprogramming", () => {
  it("can calcluate recursive keys", () => {
    const test: SameType<
      RecursiveKeyOf<{
        a: number;
        b: {
          c: boolean;
          d: {
            e: number;
          };
        };
      }>,
      "a" | "a.b" | "a.b.c" | "a.b.d" | "a.b.d.e"
    > = true;
    expect(test).to.be.true;
  });

  it("can detect recursive elems", () => {
    const test: SameType<LeafElems<[[["a"], "b"], ["c"]]>, "a" | "b" | "c"> = true;
    expect(test).to.be.true;
  });

  it("Can deep pick", () => {
    interface original {
      a: number;
      b: {
        c: boolean;
        d: {
          e: number;
        };
        g: boolean;
      };
      h: number;
    }

    interface expected {
      a: number;
      b: {
        c: boolean;
      };
    }

    const test: SameType<DeepPick<original, "a" | "b.c">, expected> = true;
    expect(test).to.be.true;
  });

  it("can deep omit", () => {
    interface original {
      a: number;
      b: {
        c: boolean;
        d: {
          e: number;
        };
        g: boolean;
      };
      h: number;
    }

    interface expected {
      b: {
        d: {
          e: number;
        };
        g: boolean;
      };
      h: number;
    }

    const test: SameType<DeepOmit<original, "a" | "b.c">, expected> = true;
    expect(test).to.be.true;
  });
});
