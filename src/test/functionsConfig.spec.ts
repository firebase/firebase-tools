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

import * as functionsConfig from "../functionsConfig";

describe("config.parseSetArgs", () => {
  it("should throw if a reserved namespace is used", () => {
    expect(() => {
      functionsConfig.parseSetArgs(["firebase.something=else"]);
    }).to.throw("reserved namespace");
  });

  it("should throw if a malformed arg is used", () => {
    expect(() => {
      functionsConfig.parseSetArgs(["foo.bar=baz", "qux"]);
    }).to.throw("must be in key=val format");
  });

  it("should parse args into correct config and variable IDs", () => {
    expect(functionsConfig.parseSetArgs(["foo.bar.faz=val"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
        val: "val",
      },
    ]);
  });
});

describe("config.parseUnsetArgs", () => {
  it("should throw if a reserved namespace is used", () => {
    expect(() => {
      functionsConfig.parseUnsetArgs(["firebase.something"]);
    }).to.throw("reserved namespace");
  });

  it("should parse args into correct config and variable IDs", () => {
    expect(functionsConfig.parseUnsetArgs(["foo.bar.faz"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
      },
    ]);
  });
});
