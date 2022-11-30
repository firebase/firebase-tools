import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import { warnIfCustomBuildScript } from "../../frameworks/utils";
import { VITE_DEFAULT_BUILD_SCRIPTS } from "../../frameworks/vite";

describe("Frameworks utils", () => {
  describe("warnIfCustomBuildScript", () => {
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
      const allowedBuildScripts = ["next build"];
      packageJson.scripts.build = buildScript;

      sandbox.stub(fs.promises, "readFile").resolves(JSON.stringify(packageJson));

      await warnIfCustomBuildScript("fakedir/", allowedBuildScripts);

      expect(consoleLogSpy.callCount).to.equal(0);
    });

    it("should print warning when a custom build script is found.", async () => {
      const buildScript = "echo 'Custom build script' && next build";
      const allowedBuildScripts = ["next build"];
      packageJson.scripts.build = buildScript;

      sandbox.stub(fs.promises, "readFile").resolves(JSON.stringify(packageJson));

      await warnIfCustomBuildScript("fakedir/", allowedBuildScripts);

      expect(consoleLogSpy).to.be.calledOnceWith(
        `WARNING: Your package.json contains a custom build script "${buildScript}" that will be ignored. Only the default build scripts "${allowedBuildScripts.join(
          " OR "
        )}" are supported. Please, refer to the docs in order to use a custom build script: https://firebase.google.com/docs/hosting/express\n`
      );
    });

    it("should print warning when a custom build script is found in Vite project.", async () => {
      const allowedBuildScripts = VITE_DEFAULT_BUILD_SCRIPTS;
      const buildScript = "echo 'Custom build script' && vite build";
      const viteProjectPath = "./scripts/frameworks-tests/vite-project-custom-build";

      await warnIfCustomBuildScript(viteProjectPath, allowedBuildScripts);

      expect(consoleLogSpy).to.be.calledOnceWith(
        `WARNING: Your package.json contains a custom build script "${buildScript}" that will be ignored. Only the default build scripts "${allowedBuildScripts.join(
          " OR "
        )}" are supported. Please, refer to the docs in order to use a custom build script: https://firebase.google.com/docs/hosting/express\n`
      );
    });
  });
});
