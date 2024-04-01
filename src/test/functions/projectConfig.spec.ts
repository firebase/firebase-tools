import { expect } from "chai";

import * as projectConfig from "../../functions/projectConfig";
import { FirebaseError } from "../../error";

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
      expect(() => projectConfig.validate([{ runtime: "nodejs10" }])).to.throw(
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

    it("fails validation given config w/ duplicate source", () => {
      expect(() =>
        projectConfig.validate([TEST_CONFIG_0, { ...TEST_CONFIG_0, codebase: "unique-codebase" }]),
      ).to.throw(FirebaseError, /source must be unique/);
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
  });

  describe("normalizeAndValidate", () => {
    it("returns normalized config for singleton config", () => {
      expect(projectConfig.normalizeAndValidate(TEST_CONFIG_0)).to.deep.equal([TEST_CONFIG_0]);
    });

    it("returns normalized config for multi-resource config", () => {
      expect(projectConfig.normalizeAndValidate([TEST_CONFIG_0])).to.deep.equal([TEST_CONFIG_0]);
    });

    it("fails validation given singleton config w/o source", () => {
      expect(() => projectConfig.normalizeAndValidate({ runtime: "nodejs10" })).to.throw(
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
      expect(() => projectConfig.normalizeAndValidate([{ runtime: "nodejs10" }])).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given config w/ duplicate source", () => {
      expect(() => projectConfig.normalizeAndValidate([TEST_CONFIG_0, TEST_CONFIG_0])).to.throw(
        FirebaseError,
        /functions.source must be unique/,
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
