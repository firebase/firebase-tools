import * as fs from "fs-extra";
import * as path from "path";
import { BaseAgent } from "./base";
import { AgentOptions, AgentResult } from "../types";

/**
 * Smart mock agent that can perform actual Firebase Functions migration
 */
export class SmartMockAgent extends BaseAgent {
  constructor() {
    super("smart-mock");
  }

  async run(
    prompt: string,
    workspaceDir: string,
    options?: AgentOptions
  ): Promise<AgentResult> {
    try {
      this.logDebug(`Smart mock agent running in: ${workspaceDir}`);
      
      // Check if this is a Firebase migration task
      if (prompt.includes("firebase") && prompt.includes("functions.config()")) {
        return this.handleFirebaseMigration(workspaceDir);
      }
      
      // Handle simple file creation
      if (prompt.includes("hello.txt")) {
        await fs.writeFile(
          path.join(workspaceDir, "hello.txt"),
          "Hello, World!",
          "utf-8"
        );
        return {
          success: true,
          output: "Created hello.txt file",
        };
      }
      
      return {
        success: true,
        output: "Task completed",
      };
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  private async handleFirebaseMigration(workspaceDir: string): Promise<AgentResult> {
    try {
      const indexPath = path.join(workspaceDir, "index.js");
      
      if (!await fs.pathExists(indexPath)) {
        return {
          success: false,
          error: "No index.js file found to migrate",
        };
      }
      
      let content = await fs.readFile(indexPath, "utf-8");
      const originalContent = content;
      
      // Track all environment variables we need
      const envVars: Record<string, string> = {};
      
      // Add imports if not present
      if (!content.includes("defineString") && !content.includes("defineSecret")) {
        content = content.replace(
          "const functions = require('firebase-functions');",
          "const functions = require('firebase-functions');\nconst { defineString, defineSecret } = require('firebase-functions/params');"
        );
      }
      
      // Define all parameters at the top
      const paramDefinitions: string[] = [];
      
      // Handle basic config pattern
      if (content.includes("functions.config()")) {
        // Extract config usage patterns and replace them
        const configRegex = /functions\.config\(\)\.(\w+)\.(\w+)/g;
        const configAccesses = new Set<string>();
        
        let match;
        while ((match = configRegex.exec(originalContent)) !== null) {
          const [fullMatch, service, key] = match;
          const paramName = `${service.toUpperCase()}_${key.toUpperCase()}`;
          configAccesses.add(`${service}.${key}:${paramName}`);
        }
        
        // Define parameters
        for (const access of configAccesses) {
          const [path, paramName] = access.split(":");
          const [service, key] = path.split(".");
          
          // Determine if it's a secret
          const isSecret = key.includes("key") || key.includes("secret") || 
                          key.includes("password") || key.includes("token");
          
          const paramType = isSecret ? "defineSecret" : "defineString";
          paramDefinitions.push(`const ${service}${key.charAt(0).toUpperCase()}${key.slice(1)} = ${paramType}('${paramName}');`);
          
          // Add to env vars
          envVars[paramName] = `your_${key}_here`;
        }
        
        // Replace config accesses
        for (const access of configAccesses) {
          const [path, paramName] = access.split(":");
          const [service, key] = path.split(".");
          const varName = `${service}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
          
          // Replace patterns
          content = content.replace(
            new RegExp(`functions\\.config\\(\\)\\.${service}\\.${key}`, "g"),
            `${varName}.value()`
          );
          
          // Also handle when assigned to const
          content = content.replace(
            new RegExp(`const\\s+(\\w+)\\s*=\\s*config\\.${service}\\.${key}`, "g"),
            `const $1 = ${varName}.value()`
          );
        }
      }
      
      // Handle nested config with optional chaining
      const nestedConfigRegex = /(\w+)\.(\w+)\?\.(\w+)/g;
      content = content.replace(nestedConfigRegex, (match, obj, prop1, prop2) => {
        if (obj === "services" || obj === "features") {
          const paramName = `${obj.toUpperCase()}_${prop1.toUpperCase()}_${prop2.toUpperCase()}`;
          const varName = `${prop1}${prop2.charAt(0).toUpperCase()}${prop2.slice(1)}`;
          
          if (!paramDefinitions.some(def => def.includes(varName))) {
            const isSecret = prop2.includes("key") || prop2.includes("secret") || 
                            prop2.includes("token") || prop2.includes("webhook");
            const paramType = isSecret ? "defineSecret" : "defineString";
            paramDefinitions.push(`const ${varName} = ${paramType}('${paramName}', { default: '' });`);
            envVars[paramName] = "";
          }
          
          return `${varName}.value()`;
        }
        return match;
      });
      
      // Handle cleanup retention with default
      if (content.includes("cleanup?.retention_days")) {
        paramDefinitions.push(`const cleanupRetentionDays = defineString('CLEANUP_RETENTION_DAYS', { default: '30' });`);
        envVars["CLEANUP_RETENTION_DAYS"] = "30";
        content = content.replace(
          /config\.cleanup\?\.retention_days \|\| '30'/g,
          "cleanupRetentionDays.value()"
        );
        content = content.replace(
          /const retention = .*/g,
          "const retentionDays = parseInt(cleanupRetentionDays.value());"
        );
      }
      
      // Insert parameter definitions after imports
      if (paramDefinitions.length > 0) {
        const importEndIndex = content.indexOf("admin.initializeApp();");
        if (importEndIndex > -1) {
          const before = content.substring(0, importEndIndex);
          const after = content.substring(importEndIndex);
          content = before + "\n// Define configuration parameters\n" + 
                   paramDefinitions.join("\n") + "\n\n" + after;
        }
      }
      
      // Clean up any remaining config references
      content = content.replace(/const config = functions\.config\(\);\n/g, "");
      
      // Write the migrated file
      await fs.writeFile(indexPath, content, "utf-8");
      
      // Create .env file
      const envContent = Object.entries(envVars)
        .map(([key, value]) => {
          const comment = key.includes("SECRET") || key.includes("KEY") || key.includes("TOKEN") 
            ? "# Keep this secret!" 
            : "";
          return `${key}=${value}${comment ? ` ${comment}` : ""}`;
        })
        .join("\n");
      
      const envHeader = `# Firebase Functions Configuration
# Copy this file to .env.local for local development

`;
      
      await fs.writeFile(
        path.join(workspaceDir, ".env"),
        envHeader + envContent,
        "utf-8"
      );
      
      return {
        success: true,
        output: "Successfully migrated Firebase Functions from functions.config() to params API",
      };
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}