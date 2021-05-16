import { expect } from "chai";
import * as sinon from "sinon";

// Have to disable this because no @types/cjson available
// eslint-disable-next-line
const cjson = require("cjson");

import { FirebaseError } from "../../../error";
import * as checkFirebaseSDKVersion from "../../../checkFirebaseSDKVersion";
import * as runtime from "../../../deploy/functions/parseRuntimeAndValidateSDK";
import * as utils from "../../../utils";

describe("getHumanFriendlyRuntimeName", () => {
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

  context("when the runtime is set in firebase.json", () => {
    it("should error if runtime field is set to node 6", () => {
      SDKVersionStub.returns("2.0.0");

      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "nodejs6");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG);
    });

    it("should error if runtime field is set to node 8", () => {
      SDKVersionStub.returns("2.0.0");

      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "nodejs8");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG);
    });

    it("should return node 10 if runtime field is set to node 10", () => {
      SDKVersionStub.returns("3.4.0");

      expect(runtime.getRuntimeChoice("path/to/source", "nodejs10")).to.equal("nodejs10");
      expect(warningSpy).not.called;
    });

    it("should return node 12 if runtime field is set to node 12", () => {
      SDKVersionStub.returns("3.4.0");

      expect(runtime.getRuntimeChoice("path/to/source", "nodejs12")).to.equal("nodejs12");
      expect(warningSpy).not.called;
    });

    it("should return node 14 if runtime field is set to node 14", () => {
      SDKVersionStub.returns("3.4.0");

      expect(runtime.getRuntimeChoice("path/to/source", "nodejs14")).to.equal("nodejs14");
      expect(warningSpy).not.called;
    });

    it("should print warning when firebase-functions version is below 2.0.0", () => {
      SDKVersionStub.returns("0.5.0");

      runtime.getRuntimeChoice("path/to/source", "nodejs10");
      expect(warningSpy).calledWith(runtime.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
    });

    it("should throw error if unsupported node version set", () => {
      expect(() => runtime.getRuntimeChoice("path/to/source", "nodejs11")).to.throw(
        FirebaseError,
        runtime.UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG
      );
    });
  });

  context("when the runtime is not set in firebase.json", () => {
    it("should error if engines field is set to node 6", () => {
      cjsonStub.returns({ engines: { node: "6" } });
      SDKVersionStub.returns("2.0.0");

      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG);
    });

    it("should error if engines field is set to node 8", () => {
      cjsonStub.returns({ engines: { node: "8" } });
      SDKVersionStub.returns("2.0.0");

      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG);
    });

    it("should return node 10 if engines field is set to node 10", () => {
      cjsonStub.returns({ engines: { node: "10" } });
      SDKVersionStub.returns("3.4.0");

      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs10");
      expect(warningSpy).not.called;
    });

    it("should return node 12 if engines field is set to node 12", () => {
      cjsonStub.returns({ engines: { node: "12" } });
      SDKVersionStub.returns("3.4.0");

      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs12");
      expect(warningSpy).not.called;
    });

    it("should return node 14 if engines field is set to node 12", () => {
      cjsonStub.returns({ engines: { node: "14" } });
      SDKVersionStub.returns("3.4.0");

      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs14");
      expect(warningSpy).not.called;
    });

    it("should print warning when firebase-functions version is below 2.0.0", () => {
      cjsonStub.returns({ engines: { node: "10" } });
      SDKVersionStub.returns("0.5.0");

      runtime.getRuntimeChoice("path/to/source", "");
      expect(warningSpy).calledWith(runtime.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
    });

    it("should not throw error if user's SDK version fails to be fetched", () => {
      cjsonStub.returns({ engines: { node: "10" } });
      // Intentionally not setting SDKVersionStub so it can fail to be fetched.
      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs10");
      expect(warningSpy).not.called;
    });

    it("should throw error if unsupported node version set", () => {
      cjsonStub.returns({
        engines: { node: "11" },
      });
      expect(() => runtime.getRuntimeChoice("path/to/source", "")).to.throw(
        FirebaseError,
        runtime.UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG
      );
    });
  });
});
