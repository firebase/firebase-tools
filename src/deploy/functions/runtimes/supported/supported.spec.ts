import { expect } from "chai";
import * as supported from ".";
import * as utils from "../../../../utils";
import * as sinon from "sinon";
import { FirebaseError } from "../../../../error";

describe("supported runtimes", () => {
  it("sorts latest numerically, not lexographically", () => {
    expect(supported.latest("nodejs")).to.not.equal("nodejs8");
  });

  it("identifies decommissioned runtimes", () => {
    expect(supported.isDecommissioned("nodejs8")).to.be.true;
  });

  describe("isRuntime", () => {
    it("identifies valid runtimes", () => {
      expect(supported.isRuntime("nodejs20")).to.be.true;
    });

    it("identifies invalid runtimes", () => {
      expect(supported.isRuntime("prolog1")).to.be.false;
    });
  });

  describe("guardVersionSupport", () => {
    let logLabeledWarning: sinon.SinonStub;
    beforeEach(() => {
      logLabeledWarning = sinon.stub(utils, "logLabeledWarning");
    });

    afterEach(() => {
      logLabeledWarning.restore();
    });

    it("throws an error for decommissioned runtimes", () => {
      expect(() => supported.guardVersionSupport("nodejs8")).to.throw(
        FirebaseError,
        "Runtime Node.js 8 was decommissioned on 2021-02-01. " +
          "To deploy you must first upgrade your runtime version",
      );
    });

    it("warns for a deprecated runtime", () => {
      supported.guardVersionSupport("nodejs20", new Date("2026-04-30"));
      expect(logLabeledWarning).to.have.been.calledWith(
        "functions",
        "Runtime Node.js 20 was deprecated on 2026-04-30 and will be " +
          "decommissioned on 2026-10-31, after which you will not be able to " +
          "deploy without upgrading. Consider upgrading now to avoid disruption. See " +
          "https://cloud.google.com/functions/docs/runtime-support for full " +
          "details on the lifecycle policy",
      );
    });

    it("warns leading up to deprecation", () => {
      supported.guardVersionSupport("nodejs20", new Date("2026-04-01"));
      expect(logLabeledWarning).to.have.been.calledWith(
        "functions",
        "Runtime Node.js 20 will be deprecated on 2026-04-30 and will be " +
          "decommissioned on 2026-10-31, after which you will not be able to " +
          "deploy without upgrading. Consider upgrading now to avoid disruption. See " +
          "https://cloud.google.com/functions/docs/runtime-support for full " +
          "details on the lifecycle policy",
      );
    });
  });
});
