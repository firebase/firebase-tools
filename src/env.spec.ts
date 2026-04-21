import { expect } from "chai";
import { detectAIAgent, setFirebaseMcp, setMcpClientName } from "./env";

describe("env", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all well-known env vars
    delete process.env.ANTIGRAVITY_CLI_ALIAS;
    delete process.env.CLAUDECODE;
    delete process.env.CLINE_ACTIVE;
    delete process.env.CODEX_SANDBOX;
    delete process.env.CURSOR_AGENT;
    delete process.env.GEMINI_CLI;
    delete process.env.OPENCODE;
    
    setFirebaseMcp(false);
    setMcpClientName(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("detectAIAgent", () => {
    it("should return unknown by default", () => {
      expect(detectAIAgent()).to.equal("unknown");
    });

    it("should detect agent from env var", () => {
      process.env.CURSOR_AGENT = "true";
      expect(detectAIAgent()).to.equal("cursor");
    });

    it("should detect agent from MCP client name when in MCP mode", () => {
      setFirebaseMcp(true);
      setMcpClientName("Claude Desktop");
      expect(detectAIAgent()).to.equal("claude_desktop");
    });

    it("should fallback to env vars if in MCP mode but no client name set", () => {
      setFirebaseMcp(true);
      process.env.CURSOR_AGENT = "true";
      expect(detectAIAgent()).to.equal("cursor");
    });

    it("should ignore MCP client name if not in MCP mode", () => {
      setMcpClientName("Claude Desktop");
      process.env.CURSOR_AGENT = "true";
      expect(detectAIAgent()).to.equal("cursor");
    });
  });
});
