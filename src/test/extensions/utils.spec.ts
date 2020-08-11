import { expect } from "chai";

import * as utils from "../../extensions/utils";

describe("extensions utils", () => {
  describe("formatTimestamp", () => {
    it("should format timestamp correctly", () => {
      expect(utils.formatTimestamp("2020-05-11T03:45:13.583677Z")).to.equal("2020-05-11 03:45:13");
    });
  });
});
