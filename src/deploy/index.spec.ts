import { expect } from "chai";
import * as sinon from "sinon";

import { isDeployingWebFramework } from "./index";

describe("Deploy", () => {
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

    describe("with site in config", () => {
      describe("single web framework", () => {
        beforeEach(() => {
          options.config.get.withArgs("hosting").returns([{ source: "src", site: "webframework" }]);
        });

        describe("without 'only' option", () => {
          it("should return true if a web framework is in config", () => {
            expect(isDeployingWebFramework(options)).to.be.true;
          });
        });

        describe("with 'only' option", () => {
          it("should return false if 'only' option does not match the site", () => {
            options.only = "hosting:othersite";
            expect(isDeployingWebFramework(options)).to.be.false;
          });

          it("should return true if 'only' option matches the site", () => {
            options.only = "hosting:webframework";
            expect(isDeployingWebFramework(options)).to.be.true;
          });

          it("should return false if 'only' option matches a function, not a web framework", () => {
            options.only = "functions:webframework";
            expect(isDeployingWebFramework(options)).to.be.false;
          });
        });
      });

      describe("with both a web framework and a non-web framework", () => {
        beforeEach(() => {
          options.config.get.withArgs("hosting").returns([
            { source: "src", site: "webframework" },
            { site: "public", public: "public" },
          ]);
        });

        describe("without 'only' option", () => {
          it("should return true if a web framework is in config", () => {
            expect(isDeployingWebFramework(options)).to.be.true;
          });
        });

        describe("with 'only' option", () => {
          it("should return false if 'only' option does not match the web framework site", () => {
            options.only = "hosting:othersite";
            expect(isDeployingWebFramework(options)).to.be.false;
          });

          it("should return true if 'only' option matches the web framework site", () => {
            options.only = "hosting:webframework";
            expect(isDeployingWebFramework(options)).to.be.true;
          });

          it("should return false if 'only' option matches a non-web framework site", () => {
            options.only = "hosting:public";
            expect(isDeployingWebFramework(options)).to.be.false;
          });

          it("should return false if 'only' option matches a function, not a web framework", () => {
            options.only = "functions:webframework";
            expect(isDeployingWebFramework(options)).to.be.false;
          });
        });
      });
    });

    describe("with target in config", () => {
      describe("single web framework", () => {
        beforeEach(() => {
          options.config.get
            .withArgs("hosting")
            .returns([{ source: "src", target: "webframework" }]);
        });

        describe("without 'only' option", () => {
          it("should return true if a web framework is in config", () => {
            expect(isDeployingWebFramework(options)).to.be.true;
          });
        });

        describe("with 'only' option", () => {
          it("should return false if 'only' option does not match the target", () => {
            options.only = "hosting:othertarget";
            expect(isDeployingWebFramework(options)).to.be.false;
          });

          it("should return true if 'only' option matches the target", () => {
            options.only = "hosting:webframework";
            expect(isDeployingWebFramework(options)).to.be.true;
          });

          it("should return false if 'only' option matches a function, not a web framework", () => {
            options.only = "functions:webframework";
            expect(isDeployingWebFramework(options)).to.be.false;
          });
        });
      });

      describe("with both a web framework and a non-web framework", () => {
        beforeEach(() => {
          options.config.get.withArgs("hosting").returns([
            { source: "src", target: "webframework" },
            { target: "public", public: "public" },
          ]);
        });

        describe("without 'only' option", () => {
          it("should return true if a web framework is in config", () => {
            expect(isDeployingWebFramework(options)).to.be.true;
          });
        });

        describe("with 'only' option", () => {
          it("should return false if 'only' option does not match the web framework target", () => {
            options.only = "hosting:othertarget";
            expect(isDeployingWebFramework(options)).to.be.false;
          });

          it("should return true if 'only' option matches the web framework target", () => {
            options.only = "hosting:webframework";
            expect(isDeployingWebFramework(options)).to.be.true;
          });

          it("should return false if 'only' option matches a non-web framework target", () => {
            options.only = "hosting:public";
            expect(isDeployingWebFramework(options)).to.be.false;
          });

          it("should return false if 'only' option matches a function, not a web framework", () => {
            options.only = "functions:webframework";
            expect(isDeployingWebFramework(options)).to.be.false;
          });
        });
      });
    });

    describe("with no web framework in config", () => {
      beforeEach(() => {
        options.config.get.withArgs("hosting").returns([{ site: "public", public: "public" }]);
      });

      describe("without 'only' option", () => {
        it("should return false if no web framework is in config", () => {
          expect(isDeployingWebFramework(options)).to.be.false;
        });
      });

      describe("with 'only' option", () => {
        it("should return false regardless of 'only' option", () => {
          options.only = "hosting:webframework";
          expect(isDeployingWebFramework(options)).to.be.false;
        });
      });
    });
  });
});
