import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import { warnIfCustomBuildScript } from "../../frameworks/utils";

describe("Frameworks utils", () => {
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
