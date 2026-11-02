import { expect } from "chai";
import * as supported from ".";
import * as utils from "../../../../utils";
import * as sinon from "sinon";
import { FirebaseError } from "../../../../error";

describe("supported runtimes", () => {
  it("sorts latest numerically, not lexographically", () => {
    expect(supported.latest("nodejs")).to.not.equal("nodejs8");
  });

  it("does not choose a preview runtime as latest when GA runtimes exist", () => {
    expect(supported.latest("nodejs")).to.equal("nodejs24");
  });

  it("falls back to experimental/beta runtime when no GA runtime exists", () => {
    expect(supported.latest("dart")).to.equal("dart3");
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

    it("warns for a preview runtime", () => {
      supported.guardVersionSupport("nodejs26");
      expect(logLabeledWarning).to.have.been.calledWith(
        "functions",
        "Runtime Node.js 26 is in Preview. Pre-release runtimes may not be suitable for production workloads.",
      );
    });

    it("warns for an experimental runtime", () => {
      supported.guardVersionSupport("dart3");
      expect(logLabeledWarning).to.have.been.calledWith(
        "functions",
        "Runtime Dart 3 is experimental. Pre-release runtimes may not be suitable for production workloads.",
      );
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
          "decommissioned on 2026-10-30, after which you will not be able to " +
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
          "decommissioned on 2026-10-30, after which you will not be able to " +
          "deploy without upgrading. Consider upgrading now to avoid disruption. See " +
          "https://cloud.google.com/functions/docs/runtime-support for full " +
          "details on the lifecycle policy",
      );
    });
  });
});
