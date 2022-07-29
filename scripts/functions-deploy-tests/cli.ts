import * as spawn from "cross-spawn";
import { ChildProcess } from "child_process";

export interface Result {
  proc: ChildProcess;
  stdout: string;
  stderr: string;
}

/**
 * Execute a Firebase CLI command.
 */
export function exec(
  cmd: string,
  project: string,
  additionalArgs: string[],
  cwd: string,
  quiet = true
): Promise<Result> {
  const args = [cmd, "--project", project];

  if (additionalArgs) {
    args.push(...additionalArgs);
  }

  const proc = spawn("firebase", args, { cwd });
  if (!proc) {
    throw new Error("Failed to start firebase CLI");
  }

  const cli: Result = {
    proc,
    stdout: "",
    stderr: "",
  };

  proc.stdout?.on("data", (data) => {
    const s = data.toString();
    if (!quiet) {
      console.log(s);
    }
    cli.stdout += s;
  });

  proc.stderr?.on("data", (data) => {
    const s = data.toString();
    if (!quiet) {
      console.log(s);
    }
    cli.stderr += s;
  });

  return new Promise((resolve) => {
    proc.on("exit", () => resolve(cli));
  });
}
