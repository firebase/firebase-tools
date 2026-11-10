import { expect } from "chai";
import * as sinon from "sinon";

import { getReleventConfigs } from "./lifecycleHooks";
import { Options } from "../options";

describe("lifecycleHooks", () => {
  describe("getReleventConfigs", () => {
    const codebaseA = { source: "a", codebase: "a", predeploy: ["echo a"] };
    const codebaseB = { source: "b", codebase: "b", predeploy: ["echo b"] };

    function optionsWith(only: string | undefined): Options {
      return {
        only,
        config: { get: sinon.stub().withArgs("functions").returns([codebaseB, codebaseA]) },
      } as unknown as Options;
    }

    it("returns every config when there is no --only", () => {
      expect(getReleventConfigs("functions", optionsWith(undefined))).to.deep.equal([
        codebaseB,
        codebaseA,
      ]);
    });

    it("returns only the codebase named by --only", () => {
      expect(getReleventConfigs("functions", optionsWith("functions:a"))).to.deep.equal([codebaseA]);
    });

    it("returns only the codebase for one function in it", () => {
      expect(getReleventConfigs("functions", optionsWith("functions:a:fn1"))).to.deep.equal([
        codebaseA,
      ]);
    });

    it("returns only the codebase for several functions in the same codebase", () => {
      const only = "functions:a:fn1,functions:a:fn2";
      expect(getReleventConfigs("functions", optionsWith(only))).to.deep.equal([codebaseA]);
    });

    it("returns each codebase once for functions in different codebases", () => {
      const only = "functions:a:fn1,functions:a:fn2,functions:b:fn3";
      expect(getReleventConfigs("functions", optionsWith(only))).to.deep.equal([
        codebaseB,
        codebaseA,
      ]);
    });

    it("falls back to every config for a function without a codebase prefix", () => {
      expect(getReleventConfigs("functions", optionsWith("functions:fn1"))).to.deep.equal([
        codebaseB,
        codebaseA,
      ]);
    });
  });
});
