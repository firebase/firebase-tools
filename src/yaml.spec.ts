import { expect } from "chai";
import { editYaml } from "./yaml";

describe("yaml", () => {
  describe("editYaml", () => {
    it("should edit a simple YAML", () => {
      expect(editYaml(`foo: [24,"42"]`, { set: { path: ["foo"], value: "hi" } })).to.equal(
        `foo: hi\n`,
      );
    });

    it("should edit a nested block-style YAML", () => {
      const before = `
foo: # comment
  # comment 2
  bar:
    - 24
    - "42"
`;
      const expectedAfter = `
foo:
  # comment
  # comment 2
  bar: hi
`.trimStart();
      expect(editYaml(before, { set: { path: ["foo", "bar"], value: "hi" } })).to.equal(
        expectedAfter,
      );
    });

    it("should set a path to an object in YAML", () => {
      const expectedAfter = `
foo:
  bar:
    - baz
`.trimStart();
      expect(
        editYaml(`foo: [24,"42"]`, { set: { path: ["foo"], value: { bar: ["baz"] } } }),
      ).to.equal(expectedAfter);
    });
  });

  it("should add fields as needed in YAML", () => {
    const before = `
foo:
  bar: [24,"42"]
`;
    const expectedAfter = `
foo:
  bar: [ 24, "42" ]
  hello:
    baz:
      - quax
`.trimStart();
    expect(
      editYaml(before, { set: { path: ["foo", "hello"], value: { baz: ["quax"] } } }),
    ).to.equal(expectedAfter);
  });
});
