import * as sinon from "sinon";
import { expect } from "chai";
import * as utils from "../utils";
import * as runtime from "../parseRuntimeAndValidateSDK";
import * as checkFirebaseSDKVersion from "../checkFirebaseSDKVersion";
import { FirebaseError } from "../error";
// have to require this because no @types/cjson available
// tslint:disable-next-line
const cjson = require("cjson");

describe("getRuntimeName", () => {
  it("should properly convert raw runtime to human friendly runtime", () => {
    expect(runtime.getHumanFriendlyRuntimeName("nodejs6")).to.contain("Node.js");
  });
});

describe("getRuntimeChoice", () => {
  const sandbox = sinon.createSandbox();
  let cjsonStub: sinon.SinonStub;
  let warningSpy: sinon.SinonSpy;
  let SDKVersionStub: sinon.SinonStub;

  beforeEach(() => {
    cjsonStub = sandbox.stub(cjson, "load");
    warningSpy = sandbox.spy(utils, "logWarning");
    SDKVersionStub = sandbox.stub(checkFirebaseSDKVersion, "getFunctionsSDKVersion");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return node 6 if package.json engines field is set to node 6 and print warning", () => {
    cjsonStub.returns({ engines: { node: "6" } });
    SDKVersionStub.returns("2.0.0");

    expect(runtime.getRuntimeChoice("path/to/source")).to.eventually.deep.equal("nodejs6");
    expect(warningSpy).calledWith(runtime.NODE6_DEPRECATION_WARNING_MSG);
  });

  it("should return node 8 if package.json engines field is set to node 8 and print warning", () => {
    cjsonStub.returns({ engines: { node: "8" } });
    SDKVersionStub.returns("2.0.0");

    expect(runtime.getRuntimeChoice("path/to/source")).to.eventually.deep.equal("nodejs8");
    expect(warningSpy).calledWith(runtime.NODE8_DEPRECATION_WARNING_MSG);
  });

  it("should return node 10 if package.json engines field is set to node 10", () => {
    cjsonStub.returns({ engines: { node: "10" } });
    SDKVersionStub.returns("3.4.0");

    expect(runtime.getRuntimeChoice("path/to/source")).to.eventually.deep.equal("nodejs10");
    expect(warningSpy).not.called;
  });

  it("should print warning when firebase-functions version is below 2.0.0", async () => {
    cjsonStub.returns({ engines: { node: "8" } });
    SDKVersionStub.returns("0.5.0");

    await runtime.getRuntimeChoice("path/to/source");
    expect(warningSpy).calledWith(runtime.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
  });

  it("should not throw error if user's SDK version fails to be fetched", () => {
    cjsonStub.returns({ engines: { node: "8" } });
    // Intentionally not setting SDKVersionStub.
    expect(runtime.getRuntimeChoice("path/to/source")).to.eventually.equal("nodejs8");
    expect(warningSpy).not.called;
  });

  it("should throw error if unsupported node version set in package.json", async () => {
    cjsonStub.returns({
      engines: { node: "11" },
    });
    await expect(runtime.getRuntimeChoice("path/to/source")).to.be.rejectedWith(
      FirebaseError,
      runtime.UNSUPPORTED_NODE_VERSION_MSG
    );
  });
});
