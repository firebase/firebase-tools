import { expect } from "chai";
import { McpContext } from "../types";
import { availableTools } from "./index";

describe("availableTools", () => {
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

  it("should return specific tools when enabledTools is provided", async () => {
    const tools = await availableTools(mockContext, [], ["firebase_login"]);

    expect(tools).to.have.length(1);
    expect(tools[0].mcp.name).to.equal("firebase_login");
  });

  it("should return core tools by default", async () => {
    const tools = await availableTools(mockContext, []);
    // an example of a core tool
    const loginTool = tools.find((t) => t.mcp.name === "firebase_login");

    expect(loginTool).to.exist;
  });

  it("should include feature-specific tools when activeFeatures is provided", async () => {
    const tools = await availableTools(mockContext, ["firestore"]);
    const firestoreTool = tools.find((t) => t.mcp.name.startsWith("firestore_"));

    expect(firestoreTool).to.exist;
  });

  it("should not include feature tools if no active features", async () => {
    const tools = await availableTools(mockContext, ["core"]);
    const firestoreTool = tools.find((t) => t.mcp.name.startsWith("firestore_"));

    expect(firestoreTool).to.not.exist;
  });
});
