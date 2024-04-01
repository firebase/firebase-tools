import { expect } from "chai";
import {
  extractParamsFromPath,
  isValidWildcardMatch,
  trimSlashes,
  compareVersionStrings,
  parseRuntimeVersion,
  isLocalHost,
} from "../../emulator/functionsEmulatorUtils";

describe("FunctionsEmulatorUtils", () => {
  describe("extractParamsFromPath", () => {
    it("should match a path which fits a wildcard template", () => {
      const params = extractParamsFromPath(
        "companies/{company}/users/{user}",
        "/companies/firebase/users/abe",
      );
      expect(params).to.deep.equal({ company: "firebase", user: "abe" });
    });

    it("should not match unfilled wildcards", () => {
      const params = extractParamsFromPath(
        "companies/{company}/users/{user}",
        "companies/{still_wild}/users/abe",
      );
      expect(params).to.deep.equal({ user: "abe" });
    });

    it("should not match a path which is too long", () => {
      const params = extractParamsFromPath(
        "companies/{company}/users/{user}",
        "companies/firebase/users/abe/boots",
      );
      expect(params).to.deep.equal({});
    });

    it("should not match a path which is too short", () => {
      const params = extractParamsFromPath(
        "companies/{company}/users/{user}",
        "companies/firebase/users/",
      );
      expect(params).to.deep.equal({});
    });

    it("should not match a path which has different chunks", () => {
      const params = extractParamsFromPath(
        "locations/{company}/users/{user}",
        "companies/firebase/users/{user}",
      );
      expect(params).to.deep.equal({});
    });
  });

  describe("isValidWildcardMatch", () => {
    it("should match a path which fits a wildcard template", () => {
      const valid = isValidWildcardMatch(
        "companies/{company}/users/{user}",
        "/companies/firebase/users/abe",
      );
      expect(valid).to.equal(true);
    });

    it("should not match a path which is too long", () => {
      const tooLong = isValidWildcardMatch(
        "companies/{company}/users/{user}",
        "companies/firebase/users/abe/boots",
      );
      expect(tooLong).to.equal(false);
    });

    it("should not match a path which is too short", () => {
      const tooShort = isValidWildcardMatch(
        "companies/{company}/users/{user}",
        "companies/firebase/users/",
      );
      expect(tooShort).to.equal(false);
    });

    it("should not match a path which has different chunks", () => {
      const differentChunk = isValidWildcardMatch(
        "locations/{company}/users/{user}",
        "companies/firebase/users/{user}",
      );
      expect(differentChunk).to.equal(false);
    });
  });

  describe("trimSlashes", () => {
    it("should remove leading and trailing slashes", () => {
      expect(trimSlashes("///a/b/c////")).to.equal("a/b/c");
    });
    it("should replace multiple adjacent slashes with a single slash", () => {
      expect(trimSlashes("a////b//c")).to.equal("a/b/c");
    });
    it("should do both", () => {
      expect(trimSlashes("///a////b//c/")).to.equal("a/b/c");
    });
  });

  describe("compareVersonStrings", () => {
    it("should detect a higher major version", () => {
      expect(compareVersionStrings("4.0.0", "3.2.1")).to.be.gt(0);
      expect(compareVersionStrings("3.2.1", "4.0.0")).to.be.lt(0);
    });

    it("should detect a higher minor version", () => {
      expect(compareVersionStrings("4.1.0", "4.0.1")).to.be.gt(0);
      expect(compareVersionStrings("4.0.1", "4.1.0")).to.be.lt(0);
    });

    it("should detect a higher patch version", () => {
      expect(compareVersionStrings("4.0.1", "4.0.0")).to.be.gt(0);
      expect(compareVersionStrings("4.0.0", "4.0.1")).to.be.lt(0);
    });

    it("should detect the same version", () => {
      expect(compareVersionStrings("4.0.0", "4.0.0")).to.eql(0);
      expect(compareVersionStrings("4.0", "4.0.0")).to.eql(0);
      expect(compareVersionStrings("4", "4.0.0")).to.eql(0);
    });
  });

  describe("parseRuntimeVerson", () => {
    it("should parse fully specified runtime strings", () => {
      expect(parseRuntimeVersion("nodejs6")).to.eql(6);
      expect(parseRuntimeVersion("nodejs8")).to.eql(8);
      expect(parseRuntimeVersion("nodejs10")).to.eql(10);
      expect(parseRuntimeVersion("nodejs12")).to.eql(12);
    });

    it("should parse plain number strings", () => {
      expect(parseRuntimeVersion("6")).to.eql(6);
      expect(parseRuntimeVersion("8")).to.eql(8);
      expect(parseRuntimeVersion("10")).to.eql(10);
      expect(parseRuntimeVersion("12")).to.eql(12);
    });

    it("should ignore unknown", () => {
      expect(parseRuntimeVersion("banana")).to.eql(undefined);
    });
  });

  describe("isLocalHost", () => {
    const testCases: {
      desc: string;
      href: string;
      expected: boolean;
    }[] = [
      {
        desc: "should return true for localhost",
        href: "http://localhost:4000",
        expected: true,
      },
      {
        desc: "should return true for 127.0.0.1",
        href: "127.0.0.1:5001/firestore",
        expected: true,
      },
      {
        desc: "should return true for ipv6 loopback",
        href: "[::1]:5001/firestore",
        expected: true,
      },
      {
        desc: "should work with https",
        href: "https://127.0.0.1:5001/firestore",
        expected: true,
      },
      {
        desc: "should return false for external uri",
        href: "http://google.com/what-is-localhost",
        expected: false,
      },
      {
        desc: "should return false for external ip",
        href: "123:100:99:12",
        expected: false,
      },
    ];
    for (const t of testCases) {
      it(t.desc, () => {
        expect(isLocalHost(t.href)).to.eq(t.expected);
      });
    }
  });
});
