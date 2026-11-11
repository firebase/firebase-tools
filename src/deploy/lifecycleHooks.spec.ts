import { expect } from "chai";

import { getReleventConfigs } from "./lifecycleHooks";
import { Options } from "../options";

describe("lifecycleHooks", () => {
  describe("getReleventConfigs", () => {
    const codebaseA = { source: "a", codebase: "a", predeploy: ["echo a"] };
    const codebaseB = { source: "b", codebase: "b", predeploy: ["echo b"] };
    const codebaseC = { source: "c", codebase: "c", predeploy: ["echo c"] };
    const allCodebases = [codebaseB, codebaseA, codebaseC];

    function select(only: string | undefined): unknown[] {
      const options = {
        only,
        config: { get: (key: string) => (key === "functions" ? allCodebases : undefined) },
      } as unknown as Options;
      return getReleventConfigs("functions", options);
    }

    it("returns every config when there is no --only", () => {
      expect(select(undefined)).to.deep.equal(allCodebases);
    });

    it("returns only the codebase named by --only", () => {
      expect(select("functions:a")).to.deep.equal([codebaseA]);
    });

    it("returns only the codebase for one function in it", () => {
      expect(select("functions:a:fn1")).to.deep.equal([codebaseA]);
    });

    it("returns only the codebase for several functions in the same codebase", () => {
      expect(select("functions:a:fn1,functions:a:fn2")).to.deep.equal([codebaseA]);
    });

    it("returns only the codebase when it and one of its functions are listed", () => {
      expect(select("functions:a,functions:a:fn1")).to.deep.equal([codebaseA]);
    });

    it("returns only the codebases of the functions listed across codebases", () => {
      const only = "functions:a:fn1,functions:a:fn2,functions:b:fn3";
      expect(select(only)).to.deep.equal([codebaseB, codebaseA]);
    });

    it("falls back to every config for a function without a codebase prefix", () => {
      expect(select("functions:fn1")).to.deep.equal(allCodebases);
    });
  });
});
