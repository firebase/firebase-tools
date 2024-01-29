import { expect } from "chai";
import { ensureTargeted } from "../../functions/ensureTargeted";

describe("ensureTargeted", () => {
  it("does nothing if 'functions' is included", () => {
    expect(ensureTargeted("hosting,functions", "codebase")).to.equal("hosting,functions");
    expect(ensureTargeted("hosting,functions", "codebase", "id")).to.equal("hosting,functions");
  });

  it("does nothing if the codebase is targeted", () => {
    expect(ensureTargeted("hosting,functions:codebase", "codebase")).to.equal(
      "hosting,functions:codebase",
    );
    expect(ensureTargeted("hosting,functions:codebase", "codebase", "id")).to.equal(
      "hosting,functions:codebase",
    );
  });

  it("does nothing if the function is targeted", () => {
    expect(ensureTargeted("hosting,functions:codebase:id", "codebase", "id")).to.equal(
      "hosting,functions:codebase:id",
    );
  });

  it("adds the codebase if missing and no id is provided", () => {
    expect(ensureTargeted("hosting", "codebase")).to.equal("hosting,functions:codebase");
  });

  it("adds the function if missing", () => {
    expect(ensureTargeted("hosting", "codebase", "id")).to.equal("hosting,functions:codebase:id");
  });
});
