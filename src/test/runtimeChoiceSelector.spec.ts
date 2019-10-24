import * as sinon from "sinon";
import { expect } from "chai";
import * as chai from "chai";
import * as utils from "../utils";
import * as runtime from "../runtimeChoiceSelector";
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

  beforeEach(() => {
    cjsonStub = sandbox.stub(cjson, "load");
    warningSpy = sandbox.spy(utils, "logWarning");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return node 6 if package.json engines field is set to node 6 and print warning", () => {
    cjsonStub.returns({ engines: { node: "6" }, dependencies: { "firebase-functions": "2.0.0" } });

    expect(runtime.getRuntimeChoice("path/to/source")).to.deep.equal("nodejs6");
    expect(warningSpy).calledWith(runtime.DEPRECATION_WARNING_MSG);
  });

  it("should return node 8 if package.json engines field is set to node 8", () => {
    cjsonStub.returns({ engines: { node: "8" }, dependencies: { "firebase-functions": "2.0.0" } });

    expect(runtime.getRuntimeChoice("path/to/source")).to.deep.equal("nodejs8");
    expect(warningSpy).not.called;
  });

  it("should return node 10 if package.json engines field is set to node 10", () => {
    cjsonStub.returns({ engines: { node: "10" }, dependencies: { "firebase-functions": "2.0.0" } });

    expect(runtime.getRuntimeChoice("path/to/source")).to.deep.equal("nodejs10");
    expect(warningSpy).not.called;
  });

  it("should print warning when firebase-functions version is below 2.0.0", () => {
    cjsonStub.returns({
      engines: { node: "10" },
      dependencies: { "firebase-functions": "^0.5.0" },
    });

    runtime.getRuntimeChoice("path/to/source");
    expect(warningSpy).calledWith(runtime.FUNCTIONS_SDK_VERSION_TOO_OLD_WARNING);
  });

  it("should not throw error if semver.intersects call errors", () => {
    cjsonStub.returns({ engines: { node: "8" } });

    expect(() => {
      runtime.getRuntimeChoice("path/to/source");
    }).to.not.throw();
    expect(warningSpy).not.called;
  });

  // TODO(b/129422952): Add this test back in when we remove runtime default behavior.
  it.skip("should throw error if package.json engines field is not set", () => {
    cjsonStub.returns({ dependencies: { "firebase-functions": "2.0.0" } });

    expect(() => {
      runtime.getRuntimeChoice("path/to/source");
    }).to.throw(FirebaseError, runtime.ENGINES_FIELD_REQUIRED_MSG);
  });

  // TODO(b/129422952): Add this test back in when we remove runtime default behavior.
  it.skip("should throw error if package.json engines field is set but missing node field", () => {
    cjsonStub.returns({
      engines: {},
      dependencies: { "firebase-functions": "2.0.0" },
    });

    expect(() => {
      runtime.getRuntimeChoice("path/to/source");
    }).to.throw(FirebaseError, runtime.ENGINES_FIELD_REQUIRED_MSG);
  });

  it("should throw error if unsupported node version set in package.json", () => {
    cjsonStub.returns({
      engines: { node: "11" },
      dependencies: { "firebase-functions": "2.0.0" },
    });

    expect(() => {
      runtime.getRuntimeChoice("path/to/source");
    }).to.throw(FirebaseError, runtime.UNSUPPORTED_NODE_VERSION_MSG);
  });
});
