import { expect } from "chai";

import * as projectConfig from "../../functions/projectConfig";
import { FirebaseError } from "../../error";

const TEST_CONFIG = { source: "foo" };

describe("projectConfig", () => {
  describe("normalize", () => {
    it("normalizes singleton configs", () => {
      expect(projectConfig.normalize(TEST_CONFIG)).to.deep.equal([TEST_CONFIG]);
    });

    it("normalizes array configs", () => {
      expect(projectConfig.normalize([TEST_CONFIG])).to.deep.equal([TEST_CONFIG]);
    });

    it("throws error if given empty configs", () => {
      expect(() => projectConfig.normalize([])).to.throw(FirebaseError);
    });
  });

  describe("validate", () => {
    it("passes validation for simple config", () => {
      expect(projectConfig.validate([TEST_CONFIG])).to.deep.equal([TEST_CONFIG]);
    });

    it("fails validation given more than one config", () => {
      expect(() =>
        projectConfig.validate([TEST_CONFIG, { ...TEST_CONFIG, source: "bar" }])
      ).to.throw(FirebaseError);
    });

    it("fails validation given config w/o source", () => {
      expect(() => projectConfig.validate([{ runtime: "nodejs10" }])).to.throw(FirebaseError);
    });

    it("fails validation given config w/ empty source", () => {
      expect(() => projectConfig.validate([{ source: "" }])).to.throw(FirebaseError);
    });
  });

  describe("normalizeAndValidate", () => {
    it("returns normalized config for singleton config", () => {
      expect(projectConfig.normalizeAndValidate(TEST_CONFIG)).to.deep.equal([TEST_CONFIG]);
    });

    it("returns normalized config for multi-resource config", () => {
      expect(projectConfig.normalizeAndValidate([TEST_CONFIG])).to.deep.equal([TEST_CONFIG]);
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

    it("fails validation given more than one config", () => {
      expect(() =>
        projectConfig.normalizeAndValidate([TEST_CONFIG, { ...TEST_CONFIG, source: "bar" }])
      ).to.throw(FirebaseError);
    });
  });
});
