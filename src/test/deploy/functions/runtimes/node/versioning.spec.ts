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

import * as utils from "../../../../../utils";
import * as versioning from "../../../../../deploy/functions/runtimes/node/versioning";

describe("checkFunctionsSDKVersion", () => {
  let warningSpy: sinon.SinonSpy;
  let latestVersion: sinon.SinonStub;

  beforeEach(() => {
    warningSpy = sinon.spy(utils, "logWarning");
    latestVersion = sinon.stub(versioning, "getLatestSDKVersion");
  });

  afterEach(() => {
    warningSpy.restore();
    latestVersion.restore();
  });

  it("Should warn if the SDK version is too low", () => {
    latestVersion.returns("1.9.9");
    versioning.checkFunctionsSDKVersion("1.9.9");
    expect(warningSpy).calledWith(versioning.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
  });

  it("Should not warn for the latest SDK version", () => {
    latestVersion.returns("3.14.159");
    versioning.checkFunctionsSDKVersion("3.14.159");
    expect(warningSpy).not.called;
  });

  it("Should give an upgrade warning", () => {
    latestVersion.returns("5.0.1");
    versioning.checkFunctionsSDKVersion("5.0.0");
    expect(warningSpy).to.have.been.calledWith(sinon.match("Please upgrade"));
    expect(warningSpy).to.not.have.been.calledWith(sinon.match("breaking change"));
  });

  it("Should give a breaking change warning", () => {
    latestVersion.returns("6.0.0");
    versioning.checkFunctionsSDKVersion("5.9.9");
    expect(warningSpy).to.have.been.calledWith(sinon.match("Please upgrade"));
    expect(warningSpy).to.have.been.calledWith(
      sinon.match("Please note that there will be breaking changes")
    );
  });
});
