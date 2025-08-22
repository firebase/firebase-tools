import { spawn } from "child_process";
import * as clc from "colorette";
import { logLabeledBullet } from "../../../utils";

export async function createApp(webAppId: string): Promise<void> {
  // Next.JS template.
  const args = [
    "create-next-app@latest",
    webAppId,
    "--empty",
    "--ts",
    "--eslint",
    "--tailwind",
    "--src-dir",
    "--app",
    "--turbopack",
    "--import-alias",
    '"@/*"',
    "--skip-install",
  ];
  await executeCommand("npx", args);

  // Using vite react template.
  // const args = ["create", "vite@latest", webAppId, "--", "--template", "react"];
  // await executeCommand("npm", args);
}

// Function to execute a command asynchronously and pipe I/O
async function executeCommand(command: string, args: string[]): Promise<void> {
  logLabeledBullet("dataconnect", `Running ${clc.bold(`${command} ${args.join(" ")}`)}`);
  return new Promise((resolve, reject) => {
    // spawn returns a ChildProcess object
    const childProcess = spawn(command, args, {
      // 'inherit' pipes stdin, stdout, and stderr to the parent process
      stdio: "inherit",
      // Runs the command in a shell, which allows for shell syntax like pipes, etc.
      shell: true,
    });

    childProcess.on("close", (code) => {
      if (code === 0) {
        // Command executed successfully
        resolve();
      } else {
        // Command failed
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    childProcess.on("error", (err) => {
      // Handle errors like command not found
      reject(err);
    });
  });
}
