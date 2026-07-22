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

    for (const key of ["site", "target"]) {
      describe(`with ${key} in config`, () => {
        describe("with a single web framework", () => {
          beforeEach(() => {
            options.config.get
              .withArgs("hosting")
              .returns([{ source: "src", [key]: "webframework" }]);
          });

          describe("without 'only' option", () => {
            it("should return true if a web framework is in config", () => {
              expect(isDeployingWebFramework(options)).to.be.true;
            });
          });

          describe("with 'only' option", () => {
            it(`should return false if 'only' option does not match the ${key}`, () => {
              options.only = "hosting:othersite";
              expect(isDeployingWebFramework(options)).to.be.false;
            });

            it(`should return true if 'only' option matches the ${key}`, () => {
              options.only = `hosting:webframework`;
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
              { source: "src", [key]: "webframework" },
              { public: "public", [key]: "public" },
            ]);
          });

          describe("without 'only' option", () => {
            it("should return true if a web framework is in config", () => {
              expect(isDeployingWebFramework(options)).to.be.true;
            });
          });

          describe("with 'only' option", () => {
            it(`should return false if 'only' option does not match the web framework ${key}`, () => {
              options.only = "hosting:othersite";
              expect(isDeployingWebFramework(options)).to.be.false;
            });

            it(`should return true if 'only' option matches the web framework ${key}`, () => {
              options.only = `hosting:webframework`;
              expect(isDeployingWebFramework(options)).to.be.true;
            });

            it(`should return false if 'only' option matches a non-web framework ${key}`, () => {
              options.only = "hosting:public";
              expect(isDeployingWebFramework(options)).to.be.false;
            });

            it("should return false if 'only' option matches a function, not a web framework", () => {
              options.only = "functions:webframework";
              expect(isDeployingWebFramework(options)).to.be.false;
            });
          });
        });

        describe("with more than one web framework in config", () => {
          beforeEach(() => {
            options.config.get.withArgs("hosting").returns([
              { source: "src", [key]: "prod" },
              { source: "src", [key]: "staging" },
              { public: "public", [key]: "static" },
            ]);
          });

          it("should return true when only 'hosting' is specified", () => {
            options.only = "hosting";
            expect(isDeployingWebFramework(options)).to.be.true;
          });

          it("should return true when targeting a web framework site", () => {
            options.only = "hosting:prod";
            expect(isDeployingWebFramework(options)).to.be.true;

            // verify if it also works for the other site
            options.only = "hosting:staging";
            expect(isDeployingWebFramework(options)).to.be.true;
          });

          it("should return false when targeting a non-web framework site", () => {
            options.only = "hosting:static";
            expect(isDeployingWebFramework(options)).to.be.false;
          });
        });
      });

      describe("with no web framework in config", () => {
        beforeEach(() => {
          options.config.get.withArgs("hosting").returns([{ [key]: "public", public: "public" }]);
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

        it("should return false when config is null", () => {
          options.config.get.withArgs("hosting").returns(null);
          expect(isDeployingWebFramework(options)).to.be.false;
        });
      });
    }
  });
});
