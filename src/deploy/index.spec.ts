import { expect } from "chai";
import * as sinon from "sinon";

import { isDeployingWebFramework } from "./index";

describe("deploy", () => {
  describe("isDeployingWebFramework", () => {
    let options: any;

    beforeEach(() => {
      options = {
        config: {
          get: sinon.stub(),
        },
        only: undefined,
      };
    });

    it("should return true if no 'only' option is set and a webframework is in config", () => {
      options.config.get.withArgs("hosting").returns([{ source: ".", site: "webframework" }]);
      expect(isDeployingWebFramework(options)).to.be.true;
    });

    it("should return false if 'only' option is set and does not match the webframework site", () => {
      options.config.get.withArgs("hosting").returns([{ source: ".", site: "webframework" }]);
      options.only = "hosting:othersite";
      expect(isDeployingWebFramework(options)).to.be.false;
    });

    it("should return true if 'only' option matches the webframework site", () => {
      options.config.get.withArgs("hosting").returns([{ source: ".", site: "webframework" }]);
      options.only = "hosting:webframework";
      expect(isDeployingWebFramework(options)).to.be.true;
    });

    it("should return false if no webframework is in config", () => {
      options.config.get.withArgs("hosting").returns([{ site: "nowf", public: "public" }]);
      expect(isDeployingWebFramework(options)).to.be.false;
    });

    it("should return true with multiple options and one is a webframework", () => {
      options.config.get.withArgs("hosting").returns([{ source: ".", site: "webframework" }]);
      options.only = "hosting:webframework,hosting:othersite";
      expect(isDeployingWebFramework(options)).to.be.true;
    });

    it("should return false with multiple options and none are a webframework", () => {
      options.config.get.withArgs("hosting").returns([{ site: "nowf", public: "public" }]);
      options.only = "hosting:othersite,functions";
      expect(isDeployingWebFramework(options)).to.be.false;
    });
  });
});
