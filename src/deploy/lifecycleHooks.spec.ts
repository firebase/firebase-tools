import { expect } from "chai";

import { getReleventConfigs } from "./lifecycleHooks";
import { Options } from "../options";

describe("getReleventConfigs", () => {
  const functionsConfig = [
    { source: "a", codebase: "a", predeploy: ["build a"] },
    { source: "b", codebase: "b", predeploy: ["build b"] },
    { source: "c", codebase: "c", predeploy: ["build c"] },
  ];

  function optionsFor(only?: string): Options {
    return {
      only,
      config: { get: (key: string) => (key === "functions" ? functionsConfig : undefined) },
    } as unknown as Options;
  }

  function codebases(only?: string): string[] {
    return getReleventConfigs("functions", optionsFor(only)).map((c: any) => c.codebase);
  }

  it("returns every codebase without --only", () => {
    expect(codebases()).to.deep.equal(["a", "b", "c"]);
  });

  it("returns every codebase for --only functions", () => {
    expect(codebases("functions")).to.deep.equal(["a", "b", "c"]);
  });

  it("returns only the named codebase", () => {
    expect(codebases("functions:a")).to.deep.equal(["a"]);
  });

  it("returns only the codebase of a single named function", () => {
    expect(codebases("functions:a:fn1")).to.deep.equal(["a"]);
  });

  it("returns only the codebase when several of its functions are named", () => {
    expect(codebases("functions:a:fn1,functions:a:fn2,functions:a:fn3")).to.deep.equal(["a"]);
  });

  it("returns each named codebase when functions span codebases", () => {
    expect(codebases("functions:a:fn1,functions:a:fn2,functions:b:fn3")).to.deep.equal(["a", "b"]);
  });

  it("ignores non-functions targets in --only", () => {
    expect(codebases("functions:a:fn1,functions:a:fn2,hosting")).to.deep.equal(["a"]);
  });

  it("falls back to every codebase for a function without a codebase prefix", () => {
    expect(codebases("functions:fn1")).to.deep.equal(["a", "b", "c"]);
  });
});
