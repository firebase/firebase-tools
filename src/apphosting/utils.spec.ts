import { expect } from "chai";

import * as utils from "./utils";

describe("utils", () => {
  describe("getEnvironmentName", () => {
    it("should throw an error if environment can't be found", () => {
      expect(utils.getEnvironmentName.bind(utils.getEnvironmentName, "apphosting.yaml")).to.throw(
        "Invalid apphosting environment file",
      );
    });

    it("should return the environment if valid environment specific apphosting file is given", () => {
      expect(utils.getEnvironmentName("apphosting.staging.yaml")).to.equal("staging");
    });
  });
});
