import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Config } from "../../../config";
import { AIToolModule, AIToolConfigResult } from "./types";

const CODEX_DIR = path.join(os.homedir(), ".codex");
const CONFIG_PATH = path.join(CODEX_DIR, "config.toml");
const SKILLS_DIR = path.join(CODEX_DIR, "skills");

export const codex: AIToolModule = {
  name: "codex",
  displayName: "Codex",

  /**
   * Configures Codex with Firebase context.
   *
   * This function sets up the necessary files for Codex to interact with the Firebase CLI.
   * It creates or updates `~/.codex/config.toml`.
   */
  async configure(config: Config, projectPath: string): Promise<AIToolConfigResult> {
    const files: AIToolConfigResult["files"] = [];
    let configUpdated = false;

    // Ensure directory exists
    if (!fs.existsSync(CODEX_DIR)) {
      fs.mkdirSync(CODEX_DIR, { recursive: true });
    }

    let content = "";
    if (fs.existsSync(CONFIG_PATH)) {
      content = fs.readFileSync(CONFIG_PATH, "utf-8");
    }

    // Check if firebase server is already configured
    // Simple check for [mcp_servers.firebase] header
    if (!content.includes("[mcp_servers.firebase]")) {
      const firebaseConfig = `
[mcp_servers.firebase]
command = "npx"
args = ["-y", "firebase-tools", "mcp", "--dir", "${projectPath}"]
`;
      // Append strictly to the end.
      // If the file doesn't end with a newline, add one.
      const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";

      fs.appendFileSync(CONFIG_PATH, prefix + firebaseConfig);
      configUpdated = true;
    }

    files.push({ path: CONFIG_PATH, updated: configUpdated });

    return { files };
  },

  getSkillPath(): string {
    return SKILLS_DIR;
  },
};
