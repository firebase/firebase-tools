import { spawnSync } from "child_process";
import { logger } from "../logger";
import { fileExistsSync } from "../fsutils";
import * as fs from "fs";
import * as path from "path";
import { FirebaseError } from "../error";
import * as pty from "@lydell/node-pty";
import { bold } from "colorette";
import { confirm } from "../prompt";
import * as clc from "colorette";

// A more robust check without external dependencies.
export function isGeminiInstalled(): boolean {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    const result = spawnSync(command, ["gemini"], { stdio: "ignore" });
    return result.status === 0;
  } catch (e) {
    // This might happen if 'which' or 'where' is not in the path, though it's highly unlikely.
    logger.debug(`Failed to run '${command} gemini':`, e);
    return false;
  }
}

export function configureProject(projectDir: string): void {
  const geminiDir = path.join(projectDir, ".gemini");

  try {
    const stats = fs.statSync(geminiDir);
    if (!stats.isDirectory()) {
      logger.warn(
        "Cannot configure the Firebase MCP server for the Gemini CLI because a file named '.gemini' exists in this directory.",
      );
      logger.warn("The Gemini CLI requires a '.gemini' directory to store its settings.");
      logger.warn("Please remove or rename the '.gemini' file to enable automatic configuration.");
      return; // Exit the function, skipping configuration.
    }
  } catch (e: any) {
    if (e.code === "ENOENT") {
      // It doesn't exist, so create the directory.
      try {
        fs.mkdirSync(geminiDir);
      } catch (mkdirErr: any) {
        // Handle potential race conditions or permission errors
        throw new FirebaseError(`Failed to create .gemini directory: ${mkdirErr.message}`, {
          original: mkdirErr,
        });
      }
    } else {
      // A different error occurred (e.g., permissions)
      throw new FirebaseError(`Failed to stat .gemini path: ${e.message}`, { original: e });
    }
  }

  // If we've reached this point, geminiDir is a valid directory.
  // Proceed with reading/writing settings.json inside it.
  const settingsPath = path.join(geminiDir, "settings.json");
  let settings: any = {};
  if (fileExistsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch (e: any) {
      logger.debug(`Could not parse .gemini/settings.json: ${e.message}. It will be overwritten.`);
      settings = {};
    }
  }

  const mcpConfig = {
    command: "npx",
    args: ["-y", "firebase-tools@latest", "experimental:mcp"],
  };

  // Check if the config is already correct
  if (
    settings.mcpServers &&
    settings.mcpServers.firebase &&
    JSON.stringify(settings.mcpServers.firebase) === JSON.stringify(mcpConfig)
  ) {
    logger.debug("Firebase MCP server for Gemini CLI is already configured.");
    return;
  }

  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  settings.mcpServers.firebase = mcpConfig;

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    logger.info("Configured Firebase MCP server for Gemini CLI.");
  } catch (e: any) {
    throw new FirebaseError(`Failed to write to .gemini/settings.json: ${e.message}`, {
      original: e,
    });
  }
}

export async function promptAndLaunchGemini(
  projectDir: string,
  prompt: string,
  retryAction?: () => Promise<any>,
): Promise<void> {
  const startColor = { r: 66, g: 133, b: 244 }; // Google Blue
  const endColor = { r: 219, g: 68, b: 55 }; // Google Red
  const text = ">Gemini";

  const createGradient = (str: string, start: { r: number, g: number, b: number }, end: { r: number, g: number, b: number }): string => {
    const steps = str.length;
    let output = "";
    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1);
      const r = Math.round(start.r + (end.r - start.r) * ratio);
      const g = Math.round(start.g + (end.g - start.g) * ratio);
      const b = Math.round(start.b + (end.b - start.b) * ratio);
      // ANSI escape code for 24-bit truecolor
      output += `\x1b[38;2;${r};${g};${b}m${str[i]}\x1b[0m`;
    }
    return output;
  };

  const colorizedGemini = createGradient(text, startColor, endColor);

  const choice = await confirm({
    message: `Debug with 'Open in ${colorizedGemini}'?`,
    default: true,
  });

  if (choice) {
    if (!isGeminiInstalled()) {
      throw new FirebaseError(
        "Gemini CLI not found. Please install it by running " +
        clc.bold("npm install -g @gemini-cli/cli"),
      );
    }
    configureProject(projectDir);
    const geminiStartTime = Date.now();
    await launchGemini(prompt);
    const geminiDuration = Date.now() - geminiStartTime;
    logger.info(
      `Welcome back! Your Gemini session lasted for ${Math.round(geminiDuration / 1000)} seconds.`,
    );

    if (retryAction) {
      const reDeploy = await confirm({
        message: "Would you like to try again?",
        default: false,
      });
      if (reDeploy) {
        return retryAction();
      }
    }
  }
}

export function launchGemini(prompt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info("Connecting to Gemini...");

    const ptyProcess = pty.spawn("gemini", ["-i", "-p", prompt], {
      name: "xterm-color",
      cols: process.stdout.columns,
      rows: process.stdout.rows,
      cwd: process.cwd(),
      env: process.env,
    });

    const dataListener = (data: Buffer): void => {
      ptyProcess.write(data.toString());
    };
    process.stdin.on("data", dataListener);

    ptyProcess.onData((data) => {
      process.stdout.write(data);
    });

    const onResize = (): void => {
      ptyProcess.resize(process.stdout.columns, process.stdout.rows);
    };
    process.stdout.on("resize", onResize);

    process.stdin.setRawMode(true);
    process.stdin.resume();

    ptyProcess.onExit(({ exitCode }) => {
      process.stdout.removeListener("resize", onResize);
      process.stdin.removeListener("data", dataListener);
      process.stdin.setRawMode(false);
      process.stdin.resume();
      if (exitCode !== 0) {
        reject(new FirebaseError(`Gemini CLI exited with code ${exitCode}`));
      } else {
        resolve();
      }
    });
  });
}
