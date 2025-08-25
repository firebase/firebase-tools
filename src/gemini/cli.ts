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

  const createGradient = (
    str: string,
    start: { r: number; g: number; b: number },
    end: { r: number; g: number; b: number },
  ): string => {
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

    const ptyProcess = pty.spawn("gemini", ["-i", prompt], {
      name: "xterm-color",
      cols: process.stdout.columns,
      rows: process.stdout.rows,
      cwd: process.cwd(),
      env: process.env,
      handleFlowControl: true,
    });

    // Store original handlers
    const originalSigintListeners = process.listeners("SIGINT");
    const originalSigtermListeners = process.listeners("SIGTERM");
    
    // Remove all existing SIGINT/SIGTERM handlers
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");

    const cleanup = (): void => {
      process.stdout.removeListener("resize", onResize);
      process.stdin.removeListener("data", dataListener);
      
      // Restore original signal handlers
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");
      originalSigintListeners.forEach((listener) => process.on("SIGINT", listener));
      originalSigtermListeners.forEach((listener) => process.on("SIGTERM", listener));
      
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.resume();
    };

    // Handle signals by forwarding to PTY process
    const signalHandler = (signal: NodeJS.Signals) => {
      return () => {
        // Forward the signal to the PTY process
        ptyProcess.kill(signal);
      };
    };

    process.on("SIGINT", signalHandler("SIGINT"));
    process.on("SIGTERM", signalHandler("SIGTERM"));

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
      cleanup();
      // Since we're just a launcher for Gemini, exit immediately when Gemini exits
      process.exit(exitCode || 0);
    });
  });
}

/**
 * Extracts help information for a given Firebase command.
 * @param commandName The command name to get help for (e.g., "deploy", "functions:delete")
 * @param client The firebase client object (passed in to avoid circular dependency)
 * @return The help text for the command, or an error message if not found
 */
export function getCommandHelp(commandName: string, client: any): string {
  const cmd = client.getCommand(commandName);
  if (cmd) {
    // Commander's outputHelp() writes to stdout, so we need to capture it
    const originalWrite = process.stdout.write;
    let helpText = "";
    process.stdout.write = (chunk: any): boolean => {
      helpText += chunk;
      return true;
    };
    
    try {
      cmd.outputHelp();
    } finally {
      process.stdout.write = originalWrite;
    }
    
    return helpText;
  }
  return `Command '${commandName}' not found. Run 'firebase help' to see available commands.`;
}

/**
 * Launches Gemini CLI with a Firebase command context.
 * @param command The Firebase command to run (e.g., "deploy", "functions:delete")
 * @param args The arguments passed to the command
 * @param projectDir The project directory
 * @param client The firebase client object (passed in to avoid circular dependency)
 */
export async function launchGeminiWithCommand(
  command: string,
  args: string[],
  projectDir: string,
  client: any,
): Promise<void> {
  // Check if Gemini is installed
  if (!isGeminiInstalled()) {
    logger.error(
      "Gemini CLI not found. To use the --with-gemini feature, please install Gemini CLI:\n" +
      "\n" +
      clc.bold("  npm install -g @google/gemini-cli") + "\n" +
      "\n" +
      "Or run it temporarily with npx:\n" +
      "\n" +
      clc.bold("  npx @google/gemini-cli -i \"Your prompt here\"") + "\n" +
      "\n" +
      "Learn more at: https://github.com/google-gemini/gemini-cli"
    );
    return;
  }

  // Configure the project for MCP
  configureProject(projectDir);

  let prompt: string;
  
  // Special handling for when no command is provided
  if (command === "help" && args.length === 0) {
    prompt = `You are an AI assistant helping with Firebase CLI commands. The user has launched Firebase with the --with-gemini flag but hasn't specified a particular command.

You have access to the Firebase CLI through the MCP server that's already configured.

Please ask the user what they would like to do with Firebase. Some common tasks include:
- Deploying functions, hosting, or other services
- Managing Firebase projects
- Working with Firestore, Realtime Database, or Storage
- Setting up authentication
- Managing extensions

Current working directory: ${projectDir}

What would you like to help the user accomplish?`;
  } else {
    // Get help text for the command
    const helpText = getCommandHelp(command, client);
    
    // Build the full command string
    const fullCommand = `firebase ${command} ${args.join(" ")}`.trim();
    
    // Build the context prompt
    prompt = `You are helping a user run a Firebase CLI command. The user wants to run:

${fullCommand}

Here is the help documentation for this command:

${helpText}

Please do the following:
1. First, analyze if the command has all required flags and arguments
2. If the command appears complete and ready to run (like "firebase deploy --only functions"), go ahead and execute it immediately using the Firebase MCP server
3. If the command is missing required information or could benefit from additional options, ask the user for clarification
4. Explain what the command will do before or after running it

The user has access to the Firebase CLI through the MCP server that's already configured.

Current working directory: ${projectDir}`;
  }

  // Launch Gemini with the context
  logger.info("Launching Gemini CLI with Firebase command context...");
  await launchGemini(prompt);
}
