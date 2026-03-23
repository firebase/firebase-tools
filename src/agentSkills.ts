import { spawn, spawnSync } from "child_process";
import * as utils from "./utils";
import { logger } from "./logger";
import * as prompt from "./prompt";

export async function promptForAgentSkills(): Promise<boolean> {
  return prompt.confirm({
    message: "Would you like to install agent skills for Firebase?",
    default: true,
  });
}

export interface InstallAgentSkillsOptions {
  cwd: string;
  global?: boolean;
  background?: boolean;
  agentName?: string;
}

export async function installAgentSkills(options: InstallAgentSkillsOptions): Promise<void> {
  if (!utils.commandExistsSync("npx")) {
    return;
  }

  const args = [
    "-y", // npx -y to auto-confirm package install
    "skills",
    "add",
    "firebase/agent-skills",
    "--skill",
    "*",
    "-y",
  ];

  if (options.agentName) {
    args.push("-a", options.agentName);
  }

  if (options.global) {
    args.push("-g");
  }

  if (options.background) {
    logger.info("⏳ Installing Agent skills in the background...");
    try {
      const child = spawn("npx", args, {
        cwd: options.cwd,
        stdio: "ignore",
        detached: true,
        shell: process.platform === "win32",
      });
      child.unref();
      logger.info("✅ Agent skills installation started");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      utils.logWarning(`Could not start Agent skills installation: ${message}`);
    }
  } else {
    logger.info("⏳ Adding Agent skills...");
    try {
      const result = spawnSync("npx", args, {
        cwd: options.cwd,
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        throw new Error(`npx skills add exited with code ${result.status}`);
      }
      logger.info(`✅ Added Agent skills`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      utils.logWarning(`Could not add Agent skills: ${message}`);
    }
  }
}
