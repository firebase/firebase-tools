import { expect } from "chai";
import * as sinon from "sinon";

import { usageEnabled } from "./track";
import { configstore } from "./configstore";

describe("track", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
    delete process.env.IS_FIREBASE_CLI;
    delete process.env.IS_FIREBASE_MCP;
  });

  describe("usageEnabled", () => {
    it("should return true if IS_FIREBASE_CLI and usage are true", () => {
      process.env.IS_FIREBASE_CLI = "true";
      sandbox.stub(configstore, "get").withArgs("usage").returns(true);
      expect(usageEnabled()).to.be.true;
    });

    it("should return false if IS_FIREBASE_CLI is not set", () => {
      sandbox.stub(configstore, "get").withArgs("usage").returns(true);
      expect(usageEnabled()).to.be.false;
    });

    it("should return false if usage is false", () => {
      process.env.IS_FIREBASE_CLI = "true";
      sandbox.stub(configstore, "get").withArgs("usage").returns(false);
      expect(usageEnabled()).to.be.false;
    });

    it("should return true if IS_FIREBASE_MCP and usage are true", () => {
      process.env.IS_FIREBASE_MCP = "true";
      sandbox.stub(configstore, "get").withArgs("usage").returns(true);
      expect(usageEnabled()).to.be.true;
    });
  });
});
