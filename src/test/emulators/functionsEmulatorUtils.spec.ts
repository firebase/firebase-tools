import { expect } from "chai";
import {
  _extractParamsFromPath,
  _isValidWildcardMatch,
} from "../../emulator/functionsEmulatorUtils";

describe("FunctionsEmulatorUtils", () => {
  describe("_extractParamsFromPath", () => {
    it("should match a path which fits a wildcard template", () => {
      const params = _extractParamsFromPath(
        "companies/{company}/users/{user}",
        "/companies/firebase/users/abe"
      );
      expect(params).to.deep.equal({ company: "firebase", user: "abe" });
    });

    it("should not match unfilled wildcards", () => {
      const params = _extractParamsFromPath(
        "companies/{company}/users/{user}",
        "companies/{still_wild}/users/abe"
      );
      expect(params).to.deep.equal({ user: "abe" });
    });

    it("should not match a path which is too long", () => {
      const params = _extractParamsFromPath(
        "companies/{company}/users/{user}",
        "companies/firebase/users/abe/boots"
      );
      expect(params).to.deep.equal({});
    });

    it("should not match a path which is too short", () => {
      const params = _extractParamsFromPath(
        "companies/{company}/users/{user}",
        "companies/firebase/users/"
      );
      expect(params).to.deep.equal({});
    });

    it("should not match a path which has different chunks", () => {
      const params = _extractParamsFromPath(
        "locations/{company}/users/{user}",
        "companies/firebase/users/{user}"
      );
      expect(params).to.deep.equal({});
    });
  });

  describe("_isValidWildcardMatch", () => {
    it("should match a path which fits a wildcard template", () => {
      const valid = _isValidWildcardMatch(
        "companies/{company}/users/{user}",
        "/companies/firebase/users/abe"
      );
      expect(valid).to.equal(true);
    });

    it("should not match a path which is too long", () => {
      const tooLong = _isValidWildcardMatch(
        "companies/{company}/users/{user}",
        "companies/firebase/users/abe/boots"
      );
      expect(tooLong).to.equal(false);
    });

    it("should not match a path which is too short", () => {
      const tooShort = _isValidWildcardMatch(
        "companies/{company}/users/{user}",
        "companies/firebase/users/"
      );
      expect(tooShort).to.equal(false);
    });

    it("should not match a path which has different chunks", () => {
      const differentChunk = _isValidWildcardMatch(
        "locations/{company}/users/{user}",
        "companies/firebase/users/{user}"
      );
      expect(differentChunk).to.equal(false);
    });
  });
});
