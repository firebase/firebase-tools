import * as spawn from "cross-spawn";
import { ChildProcess } from "child_process";

export interface Result {
  proc: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Execute a Firebase CLI command in a target directory with specified arguments and environment.
 */
export function exec(
  cmd: string,
  project: string,
  additionalArgs: string[] = [],
  cwd: string = process.cwd(),
  quiet = true,
  extraEnv: Record<string, string> = {},
): Promise<Result> {
  const args = [cmd];
  if (project) {
    args.push("--project", project);
  }

  if (additionalArgs && additionalArgs.length > 0) {
    args.push(...additionalArgs);
  }

  const env = {
    ...process.env,
    ...extraEnv,
  };

  const proc = spawn("firebase", args, { cwd, env });
  if (!proc) {
    throw new Error("Failed to start firebase CLI");
  }

  const cli: Result = {
    proc,
    stdout: "",
    stderr: "",
    exitCode: null,
  };

  proc.stdout?.on("data", (data: Buffer) => {
    const s = data.toString();
    if (!quiet) {
      process.stdout.write(s);
    }
    cli.stdout += s;
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const s = data.toString();
    if (!quiet) {
      process.stderr.write(s);
    }
    cli.stderr += s;
  });

  return new Promise((resolve) => {
    proc.on("exit", (code) => {
      cli.exitCode = code;
      resolve(cli);
    });
  });
}
