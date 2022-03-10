import { expect } from "chai";

import * as projectConfig from "../../functions/projectConfig";

describe("projectConfig", () => {
  describe("normalize", () => {
    it("normalizes singleton configs", () => {
      expect(projectConfig.normalize({ source: "foo" })).to.deep.equal([{ source: "foo" }]);
    });

    it("normalizes array configs", () => {
      expect(projectConfig.normalize([{ source: "foo" }])).to.deep.equal([{ source: "foo" }]);
    });


      it("normalizes array configs", () => {
          expect(projectConfig.normalize([{ source: "foo" }])).to.deep.equal([{ source: "foo" }]);
      });
  });
});
