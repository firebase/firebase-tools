import { getBuilderType, BuilderType } from "./utils";
import { expect } from "chai";

describe("Angular utils", () => {
  describe("getBuilderType", () => {
    it("should return the correct builder type for valid builders", () => {
      expect(getBuilderType("@angular-devkit/build-angular:browser")).to.equal(BuilderType.BROWSER);
      expect(getBuilderType("@angular-devkit/build-angular:server")).to.equal(BuilderType.SERVER);
      expect(getBuilderType("@angular-devkit/build-angular:dev-server")).to.equal(
        BuilderType.DEV_SERVER,
      );
      expect(getBuilderType("@angular-devkit/build-angular:ssr-dev-server")).to.equal(
        BuilderType.SSR_DEV_SERVER,
      );
      expect(getBuilderType("@angular-devkit/build-angular:prerender")).to.equal(
        BuilderType.PRERENDER,
      );
      expect(getBuilderType("@angular-devkit/build-angular:application")).to.equal(
        BuilderType.APPLICATION,
      );
      expect(getBuilderType("@angular-devkit/build-angular:browser-esbuild")).to.equal(
        BuilderType.BROWSER_ESBUILD,
      );
      expect(getBuilderType("@angular-devkit/build-angular:deploy")).to.equal(BuilderType.DEPLOY);
    });

    it("should return null for invalid builders", () => {
      expect(getBuilderType("@angular-devkit/build-angular:invalid")).to.be.null;
      expect(getBuilderType("invalid")).to.be.null;
      expect(getBuilderType(":")).to.be.null;
      expect(getBuilderType("::")).to.be.null;
      expect(getBuilderType("random:string")).to.be.null;
    });

    it("should handle builders with no colon", () => {
      expect(getBuilderType("@angular-devkit/build-angular")).to.be.null;
    });
  });
});
