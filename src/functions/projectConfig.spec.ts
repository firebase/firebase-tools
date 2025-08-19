import { expect } from "chai";

import * as projectConfig from "./projectConfig";
import { FirebaseError } from "../error";

const TEST_CONFIG_0 = { source: "foo" };

describe("projectConfig", () => {
  describe("normalize", () => {
    it("normalizes singleton config", () => {
      expect(projectConfig.normalize(TEST_CONFIG_0)).to.deep.equal([TEST_CONFIG_0]);
    });

    it("normalizes array config", () => {
      expect(projectConfig.normalize([TEST_CONFIG_0, TEST_CONFIG_0])).to.deep.equal([
        TEST_CONFIG_0,
        TEST_CONFIG_0,
      ]);
    });

    it("throws error if given empty config", () => {
      expect(() => projectConfig.normalize([])).to.throw(FirebaseError);
    });
  });

  describe("validate", () => {
    it("passes validation for simple config", () => {
      expect(projectConfig.validate([TEST_CONFIG_0])).to.deep.equal([TEST_CONFIG_0]);
    });

    it("fails validation given config w/o source", () => {
      expect(() => projectConfig.validate([{ runtime: "nodejs22" }])).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given config w/ empty source", () => {
      expect(() => projectConfig.validate([{ source: "" }])).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("passes validation for multi-instance config with same source", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar" },
        { source: "foo", codebase: "baz", prefix: "prefix-two" },
      ];
      expect(projectConfig.validate(config)).to.deep.equal(config);
    });

    it("passes validation for multi-instance config with one missing codebase", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar", prefix: "bar-prefix" },
        { source: "foo" },
      ];
      const expected = [
        { source: "foo", codebase: "bar", prefix: "bar-prefix" },
        { source: "foo", codebase: "default" },
      ];
      expect(projectConfig.validate(config)).to.deep.equal(expected);
    });

    it("fails validation for multi-instance config with missing codebase and a default codebase", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "default" },
        { source: "foo" },
      ];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /functions.codebase must be unique but 'default' was used more than once./,
      );
    });

    it("fails validation for multi-instance config with multiple missing codebases", () => {
      const config: projectConfig.NormalizedConfig = [{ source: "foo" }, { source: "foo" }];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /functions.codebase must be unique but 'default' was used more than once./,
      );
    });

    it("fails validation given codebase name with capital letters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, codebase: "ABCDE" }])).to.throw(
        FirebaseError,
        /Invalid codebase name/,
      );
    });

    it("fails validation given codebase name with invalid characters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, codebase: "abc.efg" }])).to.throw(
        FirebaseError,
        /Invalid codebase name/,
      );
    });

    it("fails validation given long codebase name", () => {
      expect(() =>
        projectConfig.validate([
          {
            ...TEST_CONFIG_0,
            codebase: "thisismorethan63characterslongxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          },
        ]),
      ).to.throw(FirebaseError, /Invalid codebase name/);
    });

    it("fails validation given prefix with invalid characters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, prefix: "abc.efg" }])).to.throw(
        FirebaseError,
        /Invalid prefix/,
      );
    });

    it("fails validation given prefix with capital letters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, prefix: "ABC" }])).to.throw(
        FirebaseError,
        /Invalid prefix/,
      );
    });

    it("fails validation given prefix starting with a digit", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, prefix: "1abc" }])).to.throw(
        FirebaseError,
        /Invalid prefix/,
      );
    });

    it("fails validation given a duplicate source/prefix pair", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar", prefix: "a" },
        { source: "foo", codebase: "baz", prefix: "a" },
      ];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /More than one functions config specifies the same source directory \('foo'\) and prefix \('a'\)/,
      );
    });

    it("fails validation for multi-instance config with same source and no prefixes", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar" },
        { source: "foo", codebase: "baz" },
      ];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /More than one functions config specifies the same source directory \('foo'\) and prefix \(''\)/,
      );
    });

    it("should allow a single function in an array to have a default codebase", () => {
      const config: projectConfig.NormalizedConfig = [{ source: "foo" }];
      const expected = [{ source: "foo", codebase: "default" }];
      expect(projectConfig.validate(config)).to.deep.equal(expected);
    });
  });

  describe("normalizeAndValidate", () => {
    it("returns normalized config for singleton config", () => {
      expect(projectConfig.normalizeAndValidate(TEST_CONFIG_0)).to.deep.equal([TEST_CONFIG_0]);
    });

    it("returns normalized config for multi-resource config", () => {
      expect(projectConfig.normalizeAndValidate([TEST_CONFIG_0])).to.deep.equal([TEST_CONFIG_0]);
    });

    it("fails validation given singleton config w/o source", () => {
      expect(() => projectConfig.normalizeAndValidate({ runtime: "nodejs22" })).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given singleton config w empty source", () => {
      expect(() => projectConfig.normalizeAndValidate({ source: "" })).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given multi-resource config w/o source", () => {
      expect(() => projectConfig.normalizeAndValidate([{ runtime: "nodejs22" }])).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given config w/ duplicate codebase", () => {
      expect(() =>
        projectConfig.normalizeAndValidate([
          { ...TEST_CONFIG_0, codebase: "foo" },
          { ...TEST_CONFIG_0, codebase: "foo", source: "bar" },
        ]),
      ).to.throw(FirebaseError, /functions.codebase must be unique/);
    });
  });
});
