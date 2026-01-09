import * as sinon from "sinon";
import { expect } from "chai";
import { McpContext } from "../types";
import { availablePrompts } from "./index";
// We import the *module* so we can stub the exported function on it
import * as availabilityUtil from "../util/availability";

describe("availablePrompts", () => {
  let sandbox: sinon.SinonSandbox;
  let getDefaultFeatureAvailabilityCheckStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Default stub checks to return false
    getDefaultFeatureAvailabilityCheckStub = sandbox.stub(
      availabilityUtil,
      "getDefaultFeatureAvailabilityCheck",
    );

    getDefaultFeatureAvailabilityCheckStub.withArgs("crashlytics").returns(async () => false);
    getDefaultFeatureAvailabilityCheckStub.callThrough();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const mockContext: McpContext = {
    projectId: "test-project",
    accountEmail: "test@example.com",
    config: {} as any,
    host: {
      logger: {
        debug: () => void 0,
        info: () => void 0,
        warn: () => void 0,
        error: () => void 0,
      },
    } as any,
    rc: {} as any,
    firebaseCliCommand: "firebase",
    isBillingEnabled: true,
  };

  it("should return core prompts by default", async () => {
    const prompts = await availablePrompts(mockContext, [], []);
    const corePrompt = prompts.find((p) => p.mcp._meta?.feature === "core");
    expect(corePrompt).to.exist;
  });

  it("should include feature-specific prompts when activeFeatures is provided", async () => {
    const prompts = await availablePrompts(mockContext, ["crashlytics"]);

    const features = [...new Set(prompts.map((p) => p.mcp._meta?.feature))];
    expect(features).to.have.members(["core", "crashlytics"]);

    // getDefaultFeatureAvailabilityCheck execution is deferred/lazy-loaded in prompt.ts
    // Since activeFeatures bypasses checking .isAvailable on the prompt, the stub should NOT be called.
    expect(getDefaultFeatureAvailabilityCheckStub.called).to.be.false;
  });

  it("should not include feature prompts if not in activeFeatures", async () => {
    const prompts = await availablePrompts(mockContext, [], []);
    const crashPrompt = prompts.find((p) => p.mcp._meta?.feature === "crashlytics");
    expect(crashPrompt).to.not.exist;
  });

  it("should fallback to detectedFeatures if activeFeatures is empty", async () => {
    // For this test, we want availability to be true
    getDefaultFeatureAvailabilityCheckStub.withArgs("crashlytics").returns(async () => true);

    const prompts = await availablePrompts(mockContext, [], ["crashlytics"]);
    const features = [...new Set(prompts.map((p) => p.mcp._meta?.feature))];
    expect(features).to.have.members(["core", "crashlytics"]);

    // Fallback logic calls isAvailable(), which invokes our lazy check, calling getDefault...
    expect(getDefaultFeatureAvailabilityCheckStub.called).to.be.true;
  });
});
