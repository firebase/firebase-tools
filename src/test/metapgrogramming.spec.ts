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
