import fs from "fs";
import { homedir } from "os";
import { pluginLogger } from "../../logger-wrapper";
import path from "path";

const FIREBASE_MCP_CONFIG = `
{
    "mcpServers": {
      "firebase": {
        "command": "npx",
        "args": ["-y", "firebase-tools@latest", "experimental:mcp"]
      }
    }
  }
`;

const GEMINI_CONFIG_PATH = ".gemini/settings.json";

// Writes the Firebase MCP server to the gemini code assist config file
export function writeToGeminiConfig() {
  try {
    const homeDir = homedir();
    const configPath = path.join(homeDir, GEMINI_CONFIG_PATH);

    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, "utf-8");
      try {
        const settingsJson = JSON.parse(configFile);
        if (settingsJson.mcpServers?.firebase) {
          return; // Already configured
        }

        // It's not configured, so we add it.
        const firebaseMcp = JSON.parse(FIREBASE_MCP_CONFIG);
        const newSettings = {
          ...settingsJson,
          mcpServers: {
            ...settingsJson.mcpServers,
            ...firebaseMcp.mcpServers,
          },
        };
        fs.writeFileSync(configPath, JSON.stringify(newSettings, null, 4));
        return;
      } catch (e) {
        // Invalid JSON, fall through to overwrite.
        pluginLogger.debug(`Invalid JSON in ${configPath}, overwriting.`);
      }
    }

    // File doesn't exist or was invalid.
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, FIREBASE_MCP_CONFIG);
  } catch (err) {
    pluginLogger.error(`Failed to write to ${GEMINI_CONFIG_PATH}: ${err}`);
  }
}
