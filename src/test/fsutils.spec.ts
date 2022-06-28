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

import * as fsutils from "../fsutils";

describe("fsutils", () => {
  describe("fileExistsSync", () => {
    it("should return true if the file exists", () => {
      expect(fsutils.fileExistsSync(__filename)).to.be.true;
    });

    it("should return false if the file does not exist", () => {
      expect(fsutils.fileExistsSync(`${__filename}/nope.never`)).to.be.false;
    });

    it("should return false if the path is a directory", () => {
      expect(fsutils.fileExistsSync(__dirname)).to.be.false;
    });
  });

  describe("dirExistsSync", () => {
    it("should return true if the directory exists", () => {
      expect(fsutils.dirExistsSync(__dirname)).to.be.true;
    });

    it("should return false if the directory does not exist", () => {
      expect(fsutils.dirExistsSync(`${__dirname}/nope/never`)).to.be.false;
    });

    it("should return false if the path is a file", () => {
      expect(fsutils.dirExistsSync(__filename)).to.be.false;
    });
  });
});
