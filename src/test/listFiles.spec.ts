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
import { resolve } from "path";

import { listFiles } from "../listFiles";

describe("listFiles", () => {
  // for details, see the file structure and firebase.json in test/fixtures/ignores
  it("should ignore firebase-debug.log, specified ignores, and nothing else", () => {
    const fileNames = listFiles(resolve(__dirname, "./fixtures/ignores"), [
      "**/.*",
      "firebase.json",
      "ignored.txt",
      "ignored/**/*.txt",
    ]);
    expect(fileNames).to.deep.equal(["index.html", "ignored/index.html", "present/index.html"]);
  });

  it("should allow us to not specify additional ignores", () => {
    const fileNames = listFiles(resolve(__dirname, "./fixtures/ignores"));
    expect(fileNames.sort()).to.have.members([
      ".hiddenfile",
      "firebase.json",
      "ignored.txt",
      "ignored/deeper/index.txt",
      "ignored/ignore.txt",
      "ignored/index.html",
      "index.html",
      "present/index.html",
    ]);
  });
});
