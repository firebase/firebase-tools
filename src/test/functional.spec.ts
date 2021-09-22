import { expect } from "chai";
import { flatten } from "lodash";
import { define } from "mime";

import * as f from "../functional";

describe("functional", () => {
  describe("flatten", () => {
    it("can iterate an empty object", () => {
      expect([...f.flatten({})]).to.deep.equal([]);
    });

    it("can iterate an object that's already flat", () => {
      expect([...f.flatten({ a: "b" })]).to.deep.equal([["a", "b"]]);
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

      const expected = [
        ["outer.inner.value", 42],
        ["other.value", null],
      ];

      expect([...f.flatten(init)]).to.deep.equal(expected);
    });

    it("can handle objects with array values", () => {
      const init = { values: ["a", "b"] };
      const expected = [
        ["values.0", "a"],
        ["values.1", "b"],
      ];

      expect([...f.flatten(init)]).to.deep.equal(expected);
    });

    it("can iterate an empty array", () => {
      expect([...flatten([])]).to.deep.equal([]);
    });

    it("can noop arrays", () => {
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

  it("zipIn", () => {
    expect([1, 2].map(f.zipIn(["a", "b"]))).to.deep.equal([
      [1, "a"],
      [2, "b"],
    ]);
  });

  it("assertExhaustive", () => {
    interface Bird {
      type: "bird";
    }
    interface Fish {
      type: "fish";
    }
    type Animal = Bird | Fish;

    // eslint-disable-next-line
    function passtime(animal: Animal): string {
      if (animal.type === "bird") {
        return "fly";
      } else if (animal.type === "fish") {
        return "swim";
      }

      // This line must make the containing function compile:
      f.assertExhaustive(animal);
    }

    // eslint-disable-next-line
    function speak(animal: Animal): void {
      if (animal.type === "bird") {
        console.log("chirp");
        return;
      }
      // This line must cause the containing function to fail
      // compilation if uncommented
      // f.assertExhaustive(animal);
    }
  });
});
