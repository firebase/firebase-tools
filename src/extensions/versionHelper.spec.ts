import { expect } from "chai";

import { parseVersionPredicate } from "./versionHelper";

describe("versionHelper", () => {
  describe("parseVersionPredicate", () => {
    it("should parse a version predicate with a comparator", () => {
      const predicate = ">=1.2.3";
      const result = parseVersionPredicate(predicate);
      expect(result.comparator).to.equal(">=");
      expect(result.targetSemVer).to.equal("1.2.3");
    });

    it("should parse a version predicate without a comparator", () => {
      const predicate = "1.2.3";
      const result = parseVersionPredicate(predicate);
      expect(result.comparator).to.equal("=");
      expect(result.targetSemVer).to.equal("1.2.3");
    });

    it("should not throw an error for an invalid predicate", () => {
      const predicate = "not-a-version";
      const result = parseVersionPredicate(predicate);
      expect(result.comparator).to.equal("=");
      expect(result.targetSemVer).to.equal("not-a-version");
    });
  });
});
