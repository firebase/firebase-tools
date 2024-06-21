import { expect } from "chai";
import {
  SameType,
  RecursiveKeyOf,
  LeafElems,
  DeepPick,
  DeepOmit,
  RequireKeys,
  DeepExtract,
} from "./metaprogramming";

describe("metaprogramming", () => {
  it("can calcluate recursive keys", () => {
    // BUG BUG BUG: String literals seem to extend each other? I can break the
    // test and it still passes.
    const test: SameType<
      RecursiveKeyOf<{
        a: number;
        b: {
          c: boolean;
          d: {
            e: number;
          };
          f: Array<{ g: number }>;
        };
      }>,
      "a" | "a.b" | "a.b.c" | "a.b.d" | "a.b.d.e" | "a.b.f.g"
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
        c?: boolean;
        d: {
          e: number;
        };
        g: boolean;
      };
      c?: {
        d: number;
      };
      h?: number;
    }

    interface expected {
      a: number;
      b: {
        c?: boolean;
      };
      c?: {
        d: number;
      };
      h?: number;
    }

    const test: SameType<DeepPick<original, "a" | "b.c" | "c" | "h">, expected> = true;
    expect(test).to.be.true;
  });

  it("can deep omit", () => {
    interface original {
      a: number;
      b: {
        c: boolean;
        d: {
          e?: number;
        };
        g: boolean;
      };
      h?: number;
      g: number;
    }

    interface expected {
      b: {
        d: {
          e?: number;
        };
        g: boolean;
      };
      h?: number;
      g: number;
    }

    const test: SameType<DeepOmit<original, "a" | "b.c">, expected> = true;
    expect(test).to.be.true;
  });

  it("can require keys", () => {
    interface original {
      a?: number;
      b?: number;
    }

    interface expected {
      a: number;
      b?: number;
    }

    const test: SameType<RequireKeys<original, "a">, expected> = true;
    expect(test).to.be.true;
  });

  it("Can DeepExtract", () => {
    type test = "a" | "b.c" | "b.d.e" | "b.d.f" | "b.g";
    type extract = "a" | "b.c" | "b.d";
    type expected = "a" | "b.c" | "b.d.e" | "b.d.f";
    const test: SameType<DeepExtract<test, extract>, expected> = true;
  });
});
