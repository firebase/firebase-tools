import { expect } from "chai";
import * as sinon from "sinon";
import { getDefaultFeatureAvailabilityCheck } from "./availability";
import * as util from "../util";
import * as crashlytics from "./crashlytics/availability";
import { McpContext, SERVER_FEATURES, ServerFeature } from "../types";
import { Config } from "../../config";

describe("getDefaultFeatureAvailabilityCheck", () => {
  let sandbox: sinon.SinonSandbox;
  let checkFeatureActiveStub: sinon.SinonStub;

  const mockContext = (): McpContext => ({
    projectId: "test-project",
    accountEmail: null,
    config: { projectDir: "/test-dir" } as Config,
    host: {} as any,
    rc: {} as any,
    firebaseCliCommand: "firebase",
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    checkFeatureActiveStub = sandbox.stub(util, "checkFeatureActive");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return a function that always returns true for 'core'", async () => {
    const coreCheck = getDefaultFeatureAvailabilityCheck("core");
    const result = await coreCheck(mockContext());
    expect(result).to.be.true;
    expect(checkFeatureActiveStub.notCalled).to.be.true;
  });

  it("should return the isCrashlyticsAvailable function for 'crashlytics'", () => {
    const crashlyticsCheck = getDefaultFeatureAvailabilityCheck("crashlytics");
    expect(crashlyticsCheck).to.equal(crashlytics.isCrashlyticsAvailable);
  });

  // Test all other features that rely on checkFeatureActive
  const featuresThatUseCheckActive = SERVER_FEATURES.filter(
    (f) => f !== "core" && f !== "crashlytics" && f !== "apptesting",
  );

  for (const feature of featuresThatUseCheckActive) {
    it(`should return a function that calls checkFeatureActive for '${feature}'`, async () => {
      checkFeatureActiveStub.resolves(true);
      const check = getDefaultFeatureAvailabilityCheck(feature as ServerFeature);
      const result = await check(mockContext());

      expect(checkFeatureActiveStub.calledOnceWith(feature, "test-project")).to.be.true;
      expect(result).to.be.true;

      // Reset stub for next iteration
      checkFeatureActiveStub.resetHistory();
    });
  }
});
