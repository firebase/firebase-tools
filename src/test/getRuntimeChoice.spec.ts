import * as sinon from "sinon";
import { expect } from "chai";
import * as chai from "chai";
import * as sinonchai from "sinon-chai";
import * as utils from "../utils";
import { getRuntimeChoice } from "../getRuntimeChoice";
chai.use(sinonchai);
// have to require this because no @types/cjson available
// tslint:disable-next-line
const cjson = require("cjson");

describe("getRuntimeChoice", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
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

    expect(getRuntimeChoice("path/to/source")).to.deep.equal("nodejs6");
    expect(warningSpy).calledOnce;
  });

  it("should return node 8 if package.json engines field is set to node 8", () => {
    cjsonStub.returns({ engines: { node: "8" }, dependencies: { "firebase-functions": "2.0.0" } });

    expect(getRuntimeChoice("path/to/source")).to.deep.equal("nodejs8");
    expect(warningSpy).not.called;
  });

  it("should return node 10 if package.json engines field is set to node 10", () => {
    cjsonStub.returns({ engines: { node: "10" }, dependencies: { "firebase-functions": "2.0.0" } });

    expect(getRuntimeChoice("path/to/source")).to.deep.equal("nodejs10");
    expect(warningSpy).not.called;
  });

  it("should print warning when firebase-functions version is below 2.0.0", () => {
    cjsonStub.returns({ engines: { node: "8" }, dependencies: { "firebase-functions": "^0.5.0" } });

    getRuntimeChoice("path/to/source");
    expect(warningSpy).calledOnce;
  });

  it("should print warning when firebase-functions version is below 2.0.0", () => {
    cjsonStub.returns({
      engines: { node: "10" },
      dependencies: { "firebase-functions": "^0.5.0" },
    });

    getRuntimeChoice("path/to/source");
    expect(warningSpy).calledOnce;
  });

  it("should not throw error if semver.intersects call errors", () => {
    cjsonStub.returns({ engines: { node: "8" } });

    expect(() => {
      getRuntimeChoice("path/to/source");
    }).to.not.throw();
  });
});
