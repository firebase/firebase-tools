import { expect } from "chai";

import { pathHasRegex, cleanEscapedChars } from "../../../frameworks/next/utils";
import {
  pathsAsGlobs,
  pathsWithEscapedChars,
  pathsWithRegex,
  pathsWithRegexAndEscapedChars,
} from "./helpers";

describe("Next.js utils", () => {
  describe("pathHasRegex", () => {
    it("should identify regex", () => {
      for (const path of pathsWithRegex) {
        expect(pathHasRegex(path)).to.be.true;
      }
    });

    it("should not identify escaped parentheses as regex", () => {
      for (const path of pathsWithEscapedChars) {
        expect(pathHasRegex(path)).to.be.false;
      }
    });

    it("should identify regex along with escaped chars", () => {
      for (const path of pathsWithRegexAndEscapedChars) {
        expect(pathHasRegex(path)).to.be.true;
      }
    });

    it("should not identify globs as regex", () => {
      for (const path of pathsAsGlobs) {
        expect(pathHasRegex(path)).to.be.false;
      }
    });
  });

  describe("cleanEscapedChars", () => {
    it("should clean escaped chars", () => {
      expect(cleanEscapedChars(pathWithRegexAndEscapedChars).includes("\\")).to.be.false;
    });
  });
});
