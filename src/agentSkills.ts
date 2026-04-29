import { spawn, spawnSync } from "child_process";
import * as utils from "./utils";
import * as prompt from "./prompt";
import { getErrMsg } from "./error";
import { Options } from "./options";

export async function promptForAgentSkills(options?: Options): Promise<boolean> {
  return prompt.confirm({
    message: "Would you like to install agent skills for Firebase?",
    default: !options?.nonInteractive,
    nonInteractive: options?.nonInteractive,
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
    utils.logBullet("Installing Agent skills in the background...");
    try {
      const child = spawn("npx", args, {
        cwd: options.cwd,
        stdio: "ignore",
        detached: true,
        shell: process.platform === "win32",
      });
      child.unref();
      utils.logSuccess("Agent skills installation started");
    } catch (err: unknown) {
      utils.logWarning(`Could not start Agent skills installation: ${getErrMsg(err)}`);
    }
  } else {
    utils.logBullet("Adding Agent skills...");
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
      utils.logSuccess("Added Agent skills");
    } catch (err: unknown) {
      utils.logWarning(`Could not add Agent skills: ${getErrMsg(err)}`);
    }
  }
}
