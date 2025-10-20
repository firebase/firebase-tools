import { expect } from "chai";
import * as sinon from "sinon";
import { z } from "zod";
import { tool } from "./tool";
import * as availability from "./util/availability";
import { McpContext } from "./types";

describe("tool", () => {
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

  it("should create a tool with the correct shape and properties", () => {
    const testFn = async () => ({ content: [] });
    const testTool = tool(
      "core",
      {
        name: "test_tool",
        description: "A test tool",
        inputSchema: z.object({}),
      },
      testFn,
    );

    expect(testTool.mcp.name).to.equal("test_tool");
    expect(testTool.mcp.description).to.equal("A test tool");
    expect(testTool.fn).to.equal(testFn);
  });

  it("should use the default availability check for the feature if none is provided", () => {
    const fakeDefaultCheck = async () => true;
    getDefaultFeatureAvailabilityCheckStub.withArgs("core").returns(fakeDefaultCheck);

    const testTool = tool("core", { name: "test_tool", inputSchema: z.object({}) }, async () => ({
      content: [],
    }));

    expect(testTool.isAvailable).to.equal(fakeDefaultCheck);
    expect(getDefaultFeatureAvailabilityCheckStub.calledOnceWith("core")).to.be.true;
  });

  it("should override the default and use the provided availability check", async () => {
    const fakeDefaultCheck = async () => true;
    const overrideCheck = async () => false; // This will be the override.
    getDefaultFeatureAvailabilityCheckStub.withArgs("core").returns(fakeDefaultCheck);

    const testTool = tool(
      "core",
      {
        name: "test_tool",
        inputSchema: z.object({}),
        isAvailable: overrideCheck,
      },
      async () => ({ content: [] }),
    );

    expect(testTool.isAvailable).to.equal(overrideCheck);

    const isAvailable = await testTool.isAvailable(mockContext);
    expect(isAvailable).to.be.false;
    expect(getDefaultFeatureAvailabilityCheckStub.notCalled).to.be.true;
  });
});
