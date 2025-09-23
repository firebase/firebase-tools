import { expect } from "chai";
import { configstore } from "./configstore";
import * as sinon from "sinon";

import { checkMinRequiredVersion } from "./checkMinRequiredVersion";
import Sinon from "sinon";

describe("checkMinRequiredVersion", () => {
  let configstoreStub: Sinon.SinonStub;

  beforeEach(() => {
    configstoreStub = sinon.stub(configstore, "get");
  });

  afterEach(() => {
    configstoreStub.restore();
  });

  it("should error if installed version is below the min required version", () => {
    configstoreStub.withArgs("motd.key").returns("1000.1000.1000");

    expect(() => {
      checkMinRequiredVersion({}, "key");
    }).to.throw();
  });

  it("should not error if installed version is above the min required version", () => {
    configstoreStub.withArgs("motd.key").returns("0.0.0");

    expect(() => {
      checkMinRequiredVersion({}, "key");
    }).not.to.throw();
  });
});
