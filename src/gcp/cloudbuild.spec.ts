import { expect } from "chai";
import * as cloudbuild from "./cloudbuild";

describe("cloudbuild", () => {
  describe("getDefaultServiceAccount", () => {
    it("should return the default service account", () => {
      const projectNumber = "123456789";
      const result = cloudbuild.getDefaultServiceAccount(projectNumber);
      expect(result).to.equal("123456789@cloudbuild.gserviceaccount.com");
    });
  });
});
