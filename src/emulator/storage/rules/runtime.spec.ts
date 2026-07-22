import { expect } from "chai";
import { createAuthExpressionValue } from "./runtime";
import { RulesetOperationMethod } from "./types";

describe("Storage Rules Runtime", () => {
  describe("createAuthExpressionValue", () => {
    it("should return null if token is missing", () => {
      const opts = {
        file: {},
        method: RulesetOperationMethod.GET,
        path: "test/path",
        projectId: "test-project",
      };

      const result = createAuthExpressionValue(opts);
      expect(result).to.deep.equal({ null_value: null });
    });

    it("should return null if token is invalid", () => {
      const opts = {
        file: {},
        token: "invalid-token",
        method: RulesetOperationMethod.GET,
        path: "test/path",
        projectId: "test-project",
      };

      const result = createAuthExpressionValue(opts);
      expect(result).to.deep.equal({ null_value: null });
    });

    it("should return auth value if token is valid (or at least decodable)", () => {
      // Dummy token with payload: {"user_id": "test_user"}
      const token = "eyJhbGciOiJub25lIn0.eyJ1c2VyX2lkIjoidGVzdF91c2VyIn0.";
      const opts = {
        file: {},
        token: token,
        method: RulesetOperationMethod.GET,
        path: "test/path",
        projectId: "test-project",
      };

      const result = createAuthExpressionValue(opts);
      expect(result.map_value?.fields.uid).to.deep.equal({ string_value: "test_user" });
      expect(result.map_value?.fields.token).to.exist;
    });
  });
});
