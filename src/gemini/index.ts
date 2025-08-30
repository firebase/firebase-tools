import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import type * as pty from "@lydell/node-pty";

import { isEnabled } from "../experiments";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { confirm } from "../prompt";
import { getNeverAskAgain, setNeverAskAgain } from "./state";
import { tail } from "./tail";
import { Options } from "../options";
import { trackGA4 } from "../track";

/**
 * The possible outcomes of the Gemini handoff interaction.
 */
export type GeminiOutcome = "accepted" | "declined" | "never_ask_again" | "not_offered" | "offered";

/**
 * Checks if the Gemini CLI is installed and available in the system's PATH.
 */
export function isGeminiInstalled(): boolean {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    const result = spawnSync(command, ["gemini"], { stdio: "ignore" });
    return result.status === 0;
  } catch (e) {
    logger.debug(`Failed to run '${command} gemini':`, e);
    return false;
  }
}

/**
 * Redacts sensitive information from a string, preserving keys.
 */
export function redact(s: string): string {
  let redacted = s;

  // Redact JSON-like key-value pairs, keeping quotes for valid JSON
  const jsonPattern =
    /(['"]?)(apiKey|client_secret|token|password|refreshToken|accessToken|GCP_TOKEN|FIREBASE_TOKEN)(['"]?\s*:\s*['"])((?:[^"']|\\["'])*)(['"])/gi;
  redacted = redacted.replace(jsonPattern, "$1$2$3<REDACTED>$5");

  // Redact environment variable-like key-value pairs
  const envPattern = /((?:GOOGLE_|FIREBASE_)[A-Z_]+)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi;
  redacted = redacted.replace(envPattern, "$1=<REDACTED>");

  // Redact Bearer tokens
  const bearerPattern = /(Bearer\s+)[^"'\s,]+/gi;
  redacted = redacted.replace(bearerPattern, "$1<REDACTED>");

  // Redact PEM private keys
  const privateKeyPattern = /-----BEGIN PRIVATE KEY-----\s*["\s\S]*?\s*-----END PRIVATE KEY-----/g;
  redacted = redacted.replace(privateKeyPattern, "<REDACTED PEM PRIVATE KEY>");

  return redacted;
}

/**
 * Creates a context file for the Gemini session, containing the command, error, and logs.
 */
async function createSessionContext(error: FirebaseError, logFilePath: string): Promise<string> {
  const logLines = await tail(logFilePath, 500);
  const command = process.argv.slice(2).join(" ");

  const contextContent = `
# Firebase CLI Error Context

## Command
\`\`\`
firebase ${command}
\`\`\`

## Error
\`\`\`
${error.message}
\`\`\`

## firebase-debug.log (Last 500 lines)
\`\`\`
${logLines.join("\n")}
\`\`\`
`;

  const sanitizedContext = redact(contextContent);

  const firebaseDir = path.join(process.cwd(), ".firebase");
  fs.mkdirSync(firebaseDir, { recursive: true });

  const tempFilePath = path.join(firebaseDir, `firebase-session-context-${Date.now()}.md`);
  fs.writeFileSync(tempFilePath, sanitizedContext);
  return tempFilePath;
}

/**
 * Checks conditions and, if met, prompts the user to launch a Gemini session.
 */
export async function maybeLaunchGemini(
  error: FirebaseError,
  logFilePath: string,
  options: Options,
): Promise<void> {
  const geminiInstalled = isGeminiInstalled();
  let outcome: GeminiOutcome = "not_offered";
  let sessionDuration = 0;

  if (
    !process.stdout.isTTY ||
    options.json ||
    options.nonInteractive ||
    !isEnabled("withgemini") ||
    getNeverAskAgain()
  ) {
    return;
  }

  if (geminiInstalled) {
    outcome = "offered";
    const choice = await confirm({
      message: "An error occurred. Would you like to ask Gemini for help?",
      default: true,
    });

    if (choice) {
      outcome = "accepted";
      const startTime = Date.now();
      const contextPath = await createSessionContext(error, logFilePath);
      const prompt = `The firebase command failed with the error: '${error.message}'. I have a context file with logs that might help: ${contextPath}`;
      try {
        await launchGemini(prompt);
      } finally {
        sessionDuration = Date.now() - startTime;
        try {
          fs.unlinkSync(contextPath);
        } catch (e) {
          logger.debug(`Failed to delete context file: ${contextPath}`, e);
        }
      }
    } else {
      outcome = "declined";
      const neverAskAgain = await confirm({
        message: "Never ask again?",
        default: false,
      });
      if (neverAskAgain) {
        outcome = "never_ask_again";
        setNeverAskAgain(true);
      }
    }
  }

  void trackGA4("gemini_handoff", {
    gemini_installed: geminiInstalled.toString(),
    outcome: outcome,
    error_message: error.message,
    gemini_session_duration: sessionDuration,
  });
}

/**
 * Launches the Gemini CLI in an interactive pty session.
 */
export async function launchGemini(prompt: string): Promise<void> {
  if (!process.stdout.isTTY) {
    return;
  }

  const pty = await import("@lydell/node-pty");

  return new Promise((resolve) => {
    logger.info("Connecting to Gemini CLI...");

    const env = { ...process.env } as NodeJS.ProcessEnv;
    if (!env.TERM) {
      env.TERM = "xterm-256color";
    }

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn("gemini", ["-i", prompt], {
        name: "xterm-color",
        cols: process.stdout.columns,
        rows: process.stdout.rows,
        cwd: process.cwd(),
        env,
      });
    } catch (e) {
      logger.warn("Couldn’t launch Gemini CLI. Is it installed and in your PATH?");
      logger.debug("Failed to launch Gemini CLI", e);
      resolve();
      return;
    }

    const onResize = (): void => {
      ptyProcess.resize(process.stdout.columns, process.stdout.rows);
    };
    process.stdout.on("resize", onResize);

    const dataListener = (data: Buffer): void => {
      ptyProcess.write(data.toString());
    };
    process.stdin.on("data", dataListener);

    const sigintHandler = (): void => ptyProcess.kill("SIGINT");
    const sigtermHandler = (): void => ptyProcess.kill("SIGTERM");
    process.on("SIGINT", sigintHandler);
    process.on("SIGTERM", sigtermHandler);

    if (process.stdin.isTTY) {
      (process.stdin as NodeJS.ReadStream).setRawMode(true);
    }
    process.stdin.resume();

    ptyProcess.onData((data: string) => {
      process.stdout.write(data);
    });

    ptyProcess.onExit(() => {
      process.stdout.removeListener("resize", onResize);
      process.stdin.removeListener("data", dataListener);
      process.off("SIGINT", sigintHandler);
      process.off("SIGTERM", sigtermHandler);

      if (process.stdin.isTTY) {
        (process.stdin as NodeJS.ReadStream).setRawMode(false);
      }
      process.stdin.resume();
      resolve();
    });
  });
}
