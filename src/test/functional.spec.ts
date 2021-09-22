import { expect } from "chai";
import { define } from "mime";

import * as f from "../functional";

describe("functional", () => {
  describe("flattenObject", () => {
    it("Can noop", () => {
      expect(f.flattenObject({ a: "b" })).to.deep.equal({ a: "b" });
    });

    it("can handle nested objects", () => {
      const init = {
        outer: {
          inner: {
            value: 42,
          },
        },
        other: {
          value: null,
        },
      };

      const expected = {
        "outer.inner.value": 42,
        "other.value": null,
      };

      expect(f.flattenObject(init)).to.deep.equal(expected);
    });

    it("can handle arrays", () => {
      const init = { values: ["a", "b"] };
      const expected = {
        "values.0": "a",
        "values.1": "b",
      };

      expect(f.flattenObject(init)).to.deep.equal(expected);
    });
  });

  describe("flatten", () => {
    it("can noop", () => {
      const init = ["a", "b", "c"];
      expect([...f.flatten(init)]).to.deep.equal(init);
    });

    it("can flatten", () => {
      const init = [[[1]], [2], 3];
      expect([...f.flatten(init)]).to.deep.equal([1, 2, 3]);
    });
  });

  describe("reduceFlat", () => {
    it("can noop", () => {
      const init = ["a", "b", "c"];
      expect(init.reduce(f.reduceFlat, [])).to.deep.equal(["a", "b", "c"]);
    });

    it("can flatten", () => {
      const init = [[[1]], [2], 3];
      expect(init.reduce(f.reduceFlat, [])).to.deep.equal([1, 2, 3]);
    });
  });

  describe("zip", () => {
    it("can handle an empty array", () => {
      expect([...f.zip([], [])]).to.deep.equal([]);
    });
    it("can zip", () => {
      expect([...f.zip([1], ["a"])]).to.deep.equal([[1, "a"]]);
    });
    it("throws on length mismatch", () => {
      expect(() => f.zip([1], [])).to.throw;
    });
  });

  describe("zipLax", () => {
    it("can handle an empty array", () => {
      expect([...f.zipLax([], [])]).to.deep.equal([]);
    });
    it("can zip", () => {
      expect([...f.zipLax([1], ["a"])]).to.deep.equal([[1, "a"]]);
    });
    it("handles length mismatch", () => {
      expect([...f.zipLax([1], [])]).to.deep.equal([[1, undefined]]);
    });
  });

  it("zipIn", () => {
    expect([1, 2].map(f.zipIn(["a", "b"]))).to.deep.equal([
      [1, "a"],
      [2, "b"],
    ]);
  });

});
