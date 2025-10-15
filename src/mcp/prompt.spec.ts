import { expect } from "chai";
import * as sinon from "sinon";
import { prompt } from "./prompt";
import * as availability from "./util/availability";
import { McpContext } from "./types";

describe("prompt", () => {
  let sandbox: sinon.SinonSandbox;
  let getDefaultFeatureAvailabilityCheckStub: sinon.SinonStub;

  // A mock context object for calling isAvailable functions.
  const mockContext = {} as McpContext;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Stub the function that provides the default availability checks.
    getDefaultFeatureAvailabilityCheckStub = sandbox.stub(
      availability,
      "getDefaultFeatureAvailabilityCheck",
    );
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should create a prompt with the correct shape and properties", () => {
    const testFn = async () => [];
    const testPrompt = prompt(
      "core",
      {
        name: "test_prompt",
        description: "A test prompt",
      },
      testFn,
    );

    expect(testPrompt.mcp.name).to.equal("test_prompt");
    expect(testPrompt.mcp.description).to.equal("A test prompt");
    expect(testPrompt.fn).to.equal(testFn);
  });

  it("should use the default availability check for the feature if none is provided", () => {
    // Arrange: Prepare a fake default check function to be returned by our stub.
    const fakeDefaultCheck = async () => true;
    getDefaultFeatureAvailabilityCheckStub.withArgs("core").returns(fakeDefaultCheck);

    // Act: Create a prompt WITHOUT providing an isAvailable function.
    const testPrompt = prompt("core", { name: "test_prompt" }, async () => []);

    // Assert: The prompt's isAvailable function should be the one our stub provided.
    expect(testPrompt.isAvailable).to.equal(fakeDefaultCheck);

    // Assert: The factory function should have called the stub to get the default.
    expect(getDefaultFeatureAvailabilityCheckStub.calledOnceWith("core")).to.be.true;
  });

  it("should override the default and use the provided availability check", async () => {
    const fakeDefaultCheck = async () => true;
    const overrideCheck = async () => false;
    getDefaultFeatureAvailabilityCheckStub.withArgs("core").returns(fakeDefaultCheck);

    const testPrompt = prompt(
      "core",
      {
        name: "test_prompt",
      },
      async () => [],
      overrideCheck,
    );

    expect(testPrompt.isAvailable).to.equal(overrideCheck);

    const isAvailable = await testPrompt.isAvailable(mockContext);
    expect(isAvailable).to.be.false;

    expect(getDefaultFeatureAvailabilityCheckStub.notCalled).to.be.true;
  });
});
