import * as fs from "fs-extra";
import * as path from "path";
import { BaseAgent } from "./base";
import { AgentOptions, AgentResult } from "../types";

/**
 * Mock agent for testing Impromptu infrastructure
 */
export class MockAgent extends BaseAgent {
  constructor() {
    super("mock");
  }

  async run(
    prompt: string,
    workspaceDir: string,
    options?: AgentOptions
  ): Promise<AgentResult> {
    try {
      this.logDebug(`Mock agent running in: ${workspaceDir}`);
      this.logDebug(`Prompt length: ${prompt.length} characters`);
      
      // Simple mock behavior based on prompt content
      if (prompt.includes("hello.txt")) {
        // Create hello.txt file
        await fs.writeFile(
          path.join(workspaceDir, "hello.txt"),
          "Hello, World!",
          "utf-8"
        );
        
        return {
          success: true,
          output: "Created hello.txt file with content 'Hello, World!'",
        };
      }
      
      if (prompt.includes("firebase-functions") || prompt.includes("functions.config()")) {
        // Mock Firebase migration
        const indexPath = path.join(workspaceDir, "index.js");
        if (await fs.pathExists(indexPath)) {
          let content = await fs.readFile(indexPath, "utf-8");
          
          // Simple string replacements to simulate migration
          content = content.replace(
            "const functions = require('firebase-functions');",
            "const functions = require('firebase-functions');\nconst { defineString, defineSecret } = require('firebase-functions/params');"
          );
          
          content = content.replace(
            "const apiKey = functions.config().someservice.key;",
            "const apiKey = defineSecret('SOMESERVICE_KEY');"
          );
          
          await fs.writeFile(indexPath, content, "utf-8");
          
          // Create .env file
          await fs.writeFile(
            path.join(workspaceDir, ".env"),
            "# Firebase Functions Configuration\nSOMESERVICE_KEY=your_key_here\n",
            "utf-8"
          );
        }
        
        return {
          success: true,
          output: "Migrated Firebase Functions config to params API",
        };
      }
      
      return {
        success: true,
        output: "Mock agent completed successfully",
      };
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available for testing
  }
}