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
import * as sinon from "sinon";

import { FirebaseError } from "../../../../../error";
import * as validate from "../../../../../deploy/functions/runtimes/node/validate";
import * as fsutils from "../../../../../fsutils";

const cjson = require("cjson");

describe("validate", () => {
  describe("packageJsonIsValid", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let cjsonLoadStub: sinon.SinonStub;
    let fileExistsStub: sinon.SinonStub;

    beforeEach(() => {
      fileExistsStub = sandbox.stub(fsutils, "fileExistsSync");
      cjsonLoadStub = sandbox.stub(cjson, "load");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should throw error if package.json file is missing", () => {
      fileExistsStub.withArgs("sourceDir/package.json").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "No npm package found");
    });

    it("should throw error if functions source file is missing", () => {
      cjsonLoadStub.returns({ name: "my-project", engines: { node: "8" } });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy");
    });

    it("should throw error if main is defined and that file is missing", () => {
      cjsonLoadStub.returns({ name: "my-project", main: "src/main.js", engines: { node: "8" } });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/src/main.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy");
    });

    it("should not throw error if runtime is set in the config and the engines field is not set", () => {
      cjsonLoadStub.returns({ name: "my-project" });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(true);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.not.throw();
    });
  });
});
