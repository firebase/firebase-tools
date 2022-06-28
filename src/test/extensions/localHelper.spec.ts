/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import { resolve } from "path";
import * as sinon from "sinon";

import * as localHelper from "../../extensions/localHelper";
import { FirebaseError } from "../../error";

const EXT_FIXTURE_DIRECTORY = resolve(__dirname, "../fixtures/sample-ext");
const EXT_PREINSTALL_FIXTURE_DIRECTORY = resolve(__dirname, "../fixtures/sample-ext-preinstall");

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

    it("should return a nice error if there is no extension.yaml", async () => {
      await expect(localHelper.getLocalExtensionSpec(__dirname)).to.be.rejectedWith(FirebaseError);
    });

    describe("with an invalid YAML file", () => {
      beforeEach(() => {
        sandbox.stub(fs, "readFileSync").returns(`name: foo\nunknownkey\nother: value`);
      });

      afterEach(() => {
        sandbox.restore();
      });

      it("should return a rejected promise with a useful error if extension.yaml is invalid", async () => {
        await expect(localHelper.getLocalExtensionSpec(EXT_FIXTURE_DIRECTORY)).to.be.rejectedWith(
          FirebaseError,
          /YAML Error.+multiline key.+line.+/
        );
      });
    });

    describe("other YAML errors", () => {
      beforeEach(() => {
        sandbox.stub(yaml, "safeLoad").throws(new Error("not the files you are looking for"));
      });

      afterEach(() => {
        sandbox.restore();
      });

      it("should rethrow normal errors", async () => {
        await expect(localHelper.getLocalExtensionSpec(EXT_FIXTURE_DIRECTORY)).to.be.rejectedWith(
          FirebaseError,
          "not the files you are looking for"
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
