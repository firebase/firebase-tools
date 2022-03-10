import { expect } from "chai";

import * as projectConfig from "../../functions/projectConfig";
import { FirebaseError } from "../../error";

const TEST_CONFIG_0 = { source: "foo" };
const TEST_CONFIG_1 = { source: "bar" };

describe("projectConfig", () => {
  describe("normalize", () => {
    it("normalizes singleton configs", () => {
      expect(projectConfig.normalize(TEST_CONFIG_0)).to.deep.equal([TEST_CONFIG_0]);
    });

    it("normalizes array configs", () => {
      expect(projectConfig.normalize([TEST_CONFIG_0, TEST_CONFIG_0])).to.deep.equal([
        TEST_CONFIG_0,
        TEST_CONFIG_0,
      ]);
    });

    it("throws error if given empty configs", () => {
      expect(() => projectConfig.normalize([])).to.throw(FirebaseError);
    });
  });

  describe("validate", () => {
    it("passes validation for simple config", () => {
      expect(projectConfig.validate([TEST_CONFIG_0])).to.deep.equal([TEST_CONFIG_0]);
    });

    it("passes validation given more than one config", () => {
      expect(projectConfig.validate([TEST_CONFIG_0, TEST_CONFIG_1])).to.deep.equal([
        TEST_CONFIG_0,
        TEST_CONFIG_1,
      ]);
    });

    it("fails validation given config w/o source", () => {
      expect(() => projectConfig.validate([{ runtime: "nodejs10" }])).to.throw(FirebaseError);
    });

    it("fails validation given config w/ empty source", () => {
      expect(() => projectConfig.validate([{ source: "" }])).to.throw(FirebaseError);
    });

    it("fails validation given config w/ duplicate source", () => {
      expect(() => projectConfig.validate([TEST_CONFIG_0, TEST_CONFIG_0])).to.throw(FirebaseError);
    });
  });

  describe("normalizeAndValidate", () => {
    it("returns normalized config for singleton config", () => {
      expect(projectConfig.normalizeAndValidate(TEST_CONFIG_0)).to.deep.equal([TEST_CONFIG_0]);
    });

    it("returns normalized config for multi-resource config", () => {
      expect(projectConfig.normalizeAndValidate([TEST_CONFIG_0, TEST_CONFIG_1])).to.deep.equal([
        TEST_CONFIG_0,
        TEST_CONFIG_1,
      ]);
    });

    it("fails validation given singleton config w/o source", () => {
      expect(() => projectConfig.normalizeAndValidate({ runtime: "nodejs10" })).to.throw(
        FirebaseError
      );
    });

    it("fails validation given singleton config w empty source", () => {
      expect(() => projectConfig.normalizeAndValidate({ source: "" })).to.throw(FirebaseError);
    });

    it("fails validation given multi-resource config w/o source", () => {
      expect(() => projectConfig.normalizeAndValidate([{ runtime: "nodejs10" }])).to.throw(
        FirebaseError
      );
    });

    it("fails validation given config w/ duplicate source", () => {
      expect(() => projectConfig.validate([TEST_CONFIG_0, TEST_CONFIG_0])).to.throw(FirebaseError);
    });
  });
});
