import * as subprocess from "child_process";

export class CLIProcess {
  process?: subprocess.ChildProcess;

  constructor(private readonly name: string, private readonly workdir: string) {}

  start(
    cmd: string,
    project: string,
    additionalArgs: string[],
    logDoneFn?: (d: unknown) => unknown
  ): Promise<void> {
    const args = [cmd, "--project", project];

    if (additionalArgs) {
      args.push(...additionalArgs);
    }

    this.process = subprocess.spawn("firebase", args, { cwd: this.workdir });
    if (!this.process) {
      throw new Error("Failed to start firebase CLI");
    }

    this.process.stdout.on("data", (data: unknown) => {
      process.stdout.write(`[${this.name} stdout] ` + data);
    });

    this.process.stderr.on("data", (data: unknown) => {
      console.log(`[${this.name} stderr] ` + data);
    });

    let started: Promise<void>;
    if (logDoneFn) {
      started = new Promise((resolve) => {
        this.process?.stdout.on("data", (data: unknown) => {
          if (logDoneFn(data)) {
            resolve();
          }
        });
      });
    } else {
      started = new Promise((resolve) => {
        this.process?.once("close", () => {
          this.process = undefined;
          resolve();
        });
      });
    }

    return started;
  }

  stop(): Promise<void> {
    const p = this.process;
    if (!p) {
      return Promise.resolve();
    }

    const stopped = new Promise((resolve) => {
      p.once("exit", (/* exitCode, signal */) => {
        this.process = undefined;
        resolve();
      });
    }).then(() => undefined); // Fixes return type.

    p.kill("SIGINT");
    return stopped;
  }
}
