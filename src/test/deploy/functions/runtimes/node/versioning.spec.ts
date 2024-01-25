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
      sinon.match("Please note that there will be breaking changes"),
    );
  });
});
