import { expect } from "chai";
import * as sinon from "sinon";
import { detectAIAgent } from "./env";

describe("env", () => {
  describe("detectAIAgent", () => {
    let originalEnv: NodeJS.ProcessEnv;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      originalEnv = { ...process.env };
      sandbox = sinon.createSandbox();

      // Clear AI agent env vars to ensure clean test state
      const varsToRemove = [
        "AI_AGENT",
        "ANTIGRAVITY_AGENT",
        "GEMINI_CLI",
        "ANDROID_STUDIO_AGENT",
        "KIRO_AGENT_PATH",
        "CLAUDECODE",
        "CLAUDE_CODE",
        "CURSOR_AGENT",
        "CURSOR_TRACE_ID",
        "CURSOR_EXTENSION_HOST_ROLE",
        "COPILOT_MODEL",
        "COPILOT_ALLOW_ALL",
        "COPILOT_GITHUB_TOKEN",
        "CODEX_SANDBOX",
        "CODEX_CI",
        "CODEX_THREAD_ID",
        "CLINE_ACTIVE",
        "OPENCODE",
        "OPENCODE_CLIENT",
        "REPL_ID",
        "AUGMENT_AGENT",
      ];
      for (const v of varsToRemove) {
        delete process.env[v];
      }
    });

    afterEach(() => {
      process.env = originalEnv;
      sandbox.restore();
    });

    it("should return unknown when no agent env vars are set", () => {
      expect(detectAIAgent()).to.equal("unknown");
    });

    it("should prioritize AI_AGENT if set", () => {
      process.env.AI_AGENT = " custom-agent ";
      // Even if other vars are set, AI_AGENT wins
      process.env.CLAUDECODE = "true";
      expect(detectAIAgent()).to.equal("custom-agent");
    });

    it("should detect antigravity", () => {
      process.env.ANTIGRAVITY_AGENT = "true";
      expect(detectAIAgent()).to.equal("antigravity");
    });

    it("should detect gemini_cli", () => {
      process.env.GEMINI_CLI = "true";
      expect(detectAIAgent()).to.equal("gemini_cli");
    });

    it("should detect android_studio_agent", () => {
      process.env.ANDROID_STUDIO_AGENT = "true";
      expect(detectAIAgent()).to.equal("android_studio_agent");
    });

    it("should detect kiro", () => {
      process.env.KIRO_AGENT_PATH = "/path";
      expect(detectAIAgent()).to.equal("kiro");
    });

    describe("Claude Code detection", () => {
      it("should detect via CLAUDECODE", () => {
        process.env.CLAUDECODE = "true";
        expect(detectAIAgent()).to.equal("claude_code");
      });

      it("should detect via CLAUDE_CODE", () => {
        process.env.CLAUDE_CODE = "true";
        expect(detectAIAgent()).to.equal("claude_code");
      });
    });

    describe("Cursor detection", () => {
      it("should detect via CURSOR_AGENT", () => {
        process.env.CURSOR_AGENT = "true";
        expect(detectAIAgent()).to.equal("cursor");
      });

      it("should detect via CURSOR_TRACE_ID", () => {
        process.env.CURSOR_TRACE_ID = "123";
        expect(detectAIAgent()).to.equal("cursor");
      });

      it("should detect via CURSOR_EXTENSION_HOST_ROLE", () => {
        process.env.CURSOR_EXTENSION_HOST_ROLE = "agent-exec";
        expect(detectAIAgent()).to.equal("cursor");
      });
    });

    describe("GitHub Copilot detection", () => {
      it("should detect via COPILOT_MODEL", () => {
        process.env.COPILOT_MODEL = "gpt-4";
        expect(detectAIAgent()).to.equal("github_copilot");
      });

      it("should detect via COPILOT_ALLOW_ALL", () => {
        process.env.COPILOT_ALLOW_ALL = "true";
        expect(detectAIAgent()).to.equal("github_copilot");
      });

      it("should detect via COPILOT_GITHUB_TOKEN", () => {
        process.env.COPILOT_GITHUB_TOKEN = "token";
        expect(detectAIAgent()).to.equal("github_copilot");
      });
    });

    describe("Codex detection", () => {
      it("should detect via CODEX_SANDBOX", () => {
        process.env.CODEX_SANDBOX = "true";
        expect(detectAIAgent()).to.equal("codex_cli");
      });

      it("should detect via CODEX_CI", () => {
        process.env.CODEX_CI = "true";
        expect(detectAIAgent()).to.equal("codex_cli");
      });

      it("should detect via CODEX_THREAD_ID", () => {
        process.env.CODEX_THREAD_ID = "thread";
        expect(detectAIAgent()).to.equal("codex_cli");
      });
    });

    it("should detect cline", () => {
      process.env.CLINE_ACTIVE = "true";
      expect(detectAIAgent()).to.equal("cline");
    });

    describe("OpenCode detection", () => {
      it("should detect via OPENCODE", () => {
        process.env.OPENCODE = "true";
        expect(detectAIAgent()).to.equal("open_code");
      });

      it("should detect via OPENCODE_CLIENT", () => {
        process.env.OPENCODE_CLIENT = "true";
        expect(detectAIAgent()).to.equal("open_code");
      });
    });

    it("should detect replit", () => {
      process.env.REPL_ID = "123";
      expect(detectAIAgent()).to.equal("replit");
    });

    it("should detect augment", () => {
      process.env.AUGMENT_AGENT = "true";
      expect(detectAIAgent()).to.equal("augment");
    });
  });
});
