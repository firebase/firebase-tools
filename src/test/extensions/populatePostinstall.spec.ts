import { expect } from "chai";

import { populatePostinstall } from "../../extensions/populatePostinstall";

describe("populatePostinstallInstructions", () => {
  const instructions = "These are instructions, param foo is ${param:FOO}";
  const params = { FOO: "bar" };

  it("should substitute user-provided params into instructions", async () => {
    const result = await populatePostinstall(instructions, params);
    const expected = "These are instructions, param foo is bar";
    expect(result).to.include(expected);
  });

  it("should ignore substitutions that don't have user-provided params", async () => {
    const result = await populatePostinstall(instructions, {});
    const expected = "These are instructions, param foo is ${param:FOO}";
    expect(result).to.include(expected);
  });

  it("should substitute all occurrences of substitution markers", async () => {
    const result = await populatePostinstall(instructions + " " + instructions, params);
    const expected =
      "These are instructions, param foo is bar These are instructions, param foo is bar";
    expect(result).to.include(expected);
  });

  it("should ignore user provided-params the don't appear in the instructions", async () => {
    const moreParams = { FOO: "bar", BAR: "foo" };
    const result = await populatePostinstall(instructions, params);
    const expected = "These are instructions, param foo is bar";
    expect(result).to.include(expected);
  });
});
