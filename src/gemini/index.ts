// Node.js imports
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// 3rd party imports
import * as pty from "@lydell/node-pty";

// Local imports
import { isEnabled } from "../experiments";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { confirm } from "../prompt";
import { getNeverAskAgain, setNeverAskAgain } from "./state";
import { tail } from "./tail";
import { Options } from "../options";

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

function redact(s: string): string {
  return s
    .replace(
      /(Bearer|access_token|refresh_token|GCP_TOKEN)\s*:\s*["']?([^"'\s]+)/g,
      "$1: <REDACTED>",
    )
    .replace(/("refreshToken"|"accessToken"|"GCP_TOKEN")\s*:\s*"[^"]+"/g, '$1: "<REDACTED>"')
    .replace(
      /-----BEGIN PRIVATE KEY-----\s*[\s\S]*?\s*-----END PRIVATE KEY-----/g,
      "<REDACTED PEM PRIVATE KEY>",
    );
}

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
  if (!fs.existsSync(firebaseDir)) {
    fs.mkdirSync(firebaseDir, { recursive: true });
  }

  const tempFilePath = path.join(firebaseDir, `firebase-session-context-${Date.now()}.md`);
  fs.writeFileSync(tempFilePath, sanitizedContext);
  return tempFilePath;
}

export async function maybeLaunchGemini(
  error: FirebaseError,
  logFilePath: string,
  options: Options,
): Promise<void> {
  if (
    !process.stdout.isTTY ||
    options.json ||
    !isEnabled("withgemini") ||
    !isGeminiInstalled() ||
    getNeverAskAgain()
  ) {
    return;
  }

  const choice = await confirm({
    message: "An error occurred. Would you like to ask Gemini for help?",
    default: true,
  });

  if (!choice) {
    const neverAskAgain = await confirm({
      message: "Never ask again?",
      default: false,
    });
    if (neverAskAgain) {
      setNeverAskAgain(true);
    }
    return;
  }

  const contextPath = await createSessionContext(error, logFilePath);
  const prompt = `The firebase command failed with the error: '${error.message}'. I have a context file with logs that might help: ${contextPath}`;

  await launchGemini(prompt);
}

export function launchGemini(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    logger.info("Connecting to Gemini...");

    const ptyProcess = pty.spawn("gemini", ["-i", prompt], {
      name: "xterm-color",
      cols: process.stdout.columns,
      rows: process.stdout.rows,
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
      },
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
      originalSigintListeners.forEach((listener) =>
        process.on("SIGINT", listener as (...args: any[]) => void),
      );
      originalSigtermListeners.forEach((listener) =>
        process.on("SIGTERM", listener as (...args: any[]) => void),
      );

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

    ptyProcess.onData((data: string) => {
      process.stdout.write(data);
    });

    const onResize = (): void => {
      ptyProcess.resize(process.stdout.columns, process.stdout.rows);
    };
    process.stdout.on("resize", onResize);

    process.stdin.setRawMode(true);
    process.stdin.resume();

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      cleanup();
      resolve();
    });
  });
}
