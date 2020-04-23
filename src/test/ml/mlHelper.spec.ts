import { expect } from "chai";

import * as mlHelper from "../../ml/mlHelper";

describe("mlHelper", () => {
  describe("isValidModelId", () => {
    it("should return true on valid modelId", () => {
      const modelId = "123456";
      expect(mlHelper.isValidModelId(modelId)).to.be.true;
    });

    it("should return false on invalid modelId", () => {
      const modelId = "9invalid";
      expect(mlHelper.isValidModelId(modelId)).to.be.false;
    });

    it("should return false on empty modelId", () => {
      const modelId = "";
      expect(mlHelper.isValidModelId(modelId)).to.be.false;
    });
  });
});
