import { expect } from "chai";

import { cleanEscapedChars, pathHasRegex } from "../../../frameworks/next/utils";

describe("Next.js utils", () => {
  const pathWithRegex = "/post/:slug(\\d{1,})";
  const pathWithEscapedChars = "/post\\(someStringBetweenParentheses\\)/:slug";
  const pathWithRegexAndEscapedChars = "/post/\\(escapedparentheses\\)/:slug(\\d{1,})";

  describe("pathHasRegex", () => {
    it("should identify regex", () => {
      expect(pathHasRegex(pathWithRegex)).to.be.true;
    });

    it("should not identify escaped parentheses", () => {
      expect(pathHasRegex(pathWithEscapedChars)).to.be.false;
    });

    it("should identify regex along with escaped parentheses", () => {
      expect(pathHasRegex(pathWithRegexAndEscapedChars)).to.be.true;
    });
  });

  describe("cleanEscapedChars", () => {
    it("should clean escaped chars", () => {
      expect(cleanEscapedChars(pathWithRegexAndEscapedChars).includes("\\")).to.be.false;
    });
  });
});
