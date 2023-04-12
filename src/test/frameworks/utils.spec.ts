import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import { resolve, join } from "path";

import { warnIfCustomBuildScript, isUrl } from "../../frameworks/utils";
import { getNodeModuleBin } from "../../frameworks";

describe("Frameworks utils", () => {
  describe("getNodeModuleBin", () => {
    it("should return expected tsc path", () => {
      expect(getNodeModuleBin("tsc", __dirname)).to.equal(
        resolve(join(__dirname, "..", "..", "..", "node_modules", ".bin", "tsc"))
      );
    }).timeout(5000);
    it("should throw when npm root not found", () => {
      expect(() => {
        getNodeModuleBin("tsc", "/");
      }).to.throw("Could not find the tsc executable.");
    }).timeout(5000);
    it("should throw when executable not found", () => {
      expect(() => {
        getNodeModuleBin("xxxxx", __dirname);
      }).to.throw("Could not find the xxxxx executable.");
    }).timeout(5000);
  });

  describe("isUrl", () => {
    it("should identify http URL", () => {
      expect(isUrl("http://firebase.google.com")).to.be.true;
    });

    it("should identify https URL", () => {
      expect(isUrl("https://firebase.google.com")).to.be.true;
    });

    it("should ignore URL within path", () => {
      expect(isUrl("path/?url=https://firebase.google.com")).to.be.false;
    });

    it("should ignore path starting with http but without protocol", () => {
      expect(isUrl("httpendpoint/foo/bar")).to.be.false;
    });

    it("should ignore path starting with https but without protocol", () => {
      expect(isUrl("httpsendpoint/foo/bar")).to.be.false;
    });
  });

  describe("warnIfCustomBuildScript", () => {
    const framework = "Next.js";
    let sandbox: sinon.SinonSandbox;
    let consoleLogSpy: sinon.SinonSpy;
    const packageJson = {
      scripts: {
        build: "",
      },
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      consoleLogSpy = sandbox.spy(console, "warn");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should not print warning when a default build script is found.", async () => {
      const buildScript = "next build";
      const defaultBuildScripts = ["next build"];
      packageJson.scripts.build = buildScript;

      sandbox.stub(fs.promises, "readFile").resolves(JSON.stringify(packageJson));

      await warnIfCustomBuildScript("fakedir/", framework, defaultBuildScripts);

      expect(consoleLogSpy.callCount).to.equal(0);
    });

    it("should print warning when a custom build script is found.", async () => {
      const buildScript = "echo 'Custom build script' && next build";
      const defaultBuildScripts = ["next build"];
      packageJson.scripts.build = buildScript;

      sandbox.stub(fs.promises, "readFile").resolves(JSON.stringify(packageJson));

      await warnIfCustomBuildScript("fakedir/", framework, defaultBuildScripts);

      expect(consoleLogSpy).to.be.calledOnceWith(
        `\nWARNING: Your package.json contains a custom build that is being ignored. Only the ${framework} default build script (e.g, "${defaultBuildScripts[0]}") is respected. If you have a more advanced build process you should build a custom integration https://firebase.google.com/docs/hosting/express\n`
      );
    });
  });
});
