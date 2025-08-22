import { spawn } from "child_process";

// Function to execute a command asynchronously and pipe I/O
export async function executeCommand(command: string, args: string[]): Promise<void> {
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
