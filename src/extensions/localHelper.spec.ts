import { expect } from "chai";
import * as fs from "fs-extra";
import * as yaml from "yaml";
import * as sinon from "sinon";

import * as localHelper from "./localHelper";
import { FirebaseError } from "../error";
import { FIXTURE_DIR as EXT_FIXTURE_DIRECTORY } from "../test/fixtures/extension-yamls/sample-ext";
import { FIXTURE_DIR as EXT_PREINSTALL_FIXTURE_DIRECTORY } from "../test/fixtures/extension-yamls/sample-ext-preinstall";
import { FIXTURE_DIR as INVALID_EXT_DIRECTORY } from "../test/fixtures/extension-yamls/invalid";
import { FIXTURE_DIR as EXT_INVALID_SPEC } from "../test/fixtures/extension-yamls/valid-yaml-invalid-spec";

describe("localHelper", () => {
  const sandbox = sinon.createSandbox();

  describe("getLocalExtensionSpec", () => {
    it("should return a spec when extension.yaml is present", async () => {
      const result = await localHelper.getLocalExtensionSpec(EXT_FIXTURE_DIRECTORY);
      expect(result.name).to.equal("fixture-ext");
      expect(result.version).to.equal("1.0.0");
      expect(result.preinstallContent).to.be.undefined;
    });

    it("should populate preinstallContent when PREINSTALL.md is present", async () => {
      const result = await localHelper.getLocalExtensionSpec(EXT_PREINSTALL_FIXTURE_DIRECTORY);
      expect(result.name).to.equal("fixture-ext-with-preinstall");
      expect(result.version).to.equal("1.0.0");
      expect(result.preinstallContent).to.equal("This is a PREINSTALL file for testing with.\n");
    });

    it("should validate that the yaml is a valid extension spec", async () => {
      await expect(localHelper.getLocalExtensionSpec(EXT_INVALID_SPEC)).to.be.rejectedWith(
        FirebaseError,
        /.+Resources field must contain at least one resource/,
      );
    });

    it("should return a nice error if there is no extension.yaml", async () => {
      await expect(localHelper.getLocalExtensionSpec(__dirname)).to.be.rejectedWith(FirebaseError);
    });

    describe("with an invalid YAML file", () => {
      it("should return a rejected promise with a useful error if extension.yaml is invalid", async () => {
        await expect(localHelper.getLocalExtensionSpec(INVALID_EXT_DIRECTORY)).to.be.rejectedWith(
          FirebaseError,
          /YAML Error.+Implicit keys need to be on a single line.+line 2.+/,
        );
      });
    });

    describe("other YAML errors", () => {
      beforeEach(() => {
        sandbox.stub(yaml, "parse").throws(new Error("not the files you are looking for"));
      });

      afterEach(() => {
        sandbox.restore();
      });

      it("should rethrow normal errors", async () => {
        await expect(localHelper.getLocalExtensionSpec(EXT_FIXTURE_DIRECTORY)).to.be.rejectedWith(
          FirebaseError,
          "not the files you are looking for",
        );
      });
    });
  });

  describe("isLocalExtension", () => {
    let fsStub: sinon.SinonStub;
    beforeEach(() => {
      fsStub = sandbox.stub(fs, "readdirSync");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return true if a file exists there", () => {
      fsStub.returns("");

      const result = localHelper.isLocalExtension("some/local/path");

      expect(result).to.be.true;
    });

    it("should return false if a file doesn't exist there", () => {
      fsStub.throws(new Error("directory not found"));

      const result = localHelper.isLocalExtension("some/local/path");

      expect(result).to.be.false;
    });
  });
});
