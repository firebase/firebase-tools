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
      "Expected key bar",
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
      "Expected key foo.baz",
    );
  });
});

describe("assertKeyTypes", () => {
  const tests = [
    "string",
    "number",
    "boolean",
    "array",
    "object",
    "string?",
    "number?",
    "boolean?",
    "array?",
    "object?",
  ];
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
      const schema = { [type]: type as parsing.FieldType<typeof val> };
      it(`handles a ${testType} when expecting a ${type}`, () => {
        const obj = { [type]: val };
        const isNullable = type.endsWith("?");
        const baseType = type.split("?")[0];
        if (testType === "null") {
          if (isNullable) {
            expect(() => parsing.assertKeyTypes("", obj, schema)).not.to.throw();
          } else {
            expect(() => parsing.assertKeyTypes("", obj, schema)).to.throw(FirebaseError);
          }
        } else if (testType === baseType) {
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
      }),
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
      }),
    ).to.throw(/Unexpected key/);
  });

  it("Handles prefixes", () => {
    const obj = {
      foo: {},
    } as any;
    expect(() =>
      parsing.assertKeyTypes("outer", obj, {
        foo: "array",
      }),
    ).to.throw(FirebaseError, "Expected outer.foo to be type array");
  });
});
